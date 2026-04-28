import { DiscoveredTemplate, TemplatePermissions, ScaffoldingStep } from "../types/templateTypes";
import { scaffoldRepository } from "./repositoryService";
import { scaffoldPipeline } from "./pipelineService";
import { scaffoldServiceConnection } from "./serviceConnectionService";
import { scaffoldVariableGroup } from "./variableGroupService";
import { evaluateWhenExpression, renderTemplate, buildViewValues } from "./templateEngineService";
import { getErrorMessage } from "../utils/errorUtils";

export type StepStatus = "pending" | "running" | "success" | "skipped" | "failed";

export interface ScaffoldStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  startTime?: number;
  duration?: number;
}

export type ScaffoldResult = ScaffoldStep;

export type ProgressCallback = (steps: ScaffoldStep[]) => void;

/**
 * Orchestrates the full scaffolding flow for a template:
 *   1. Create all repositories (in parallel)
 *   2. Create all pipelines (sequentially, as each references a repo)
 *
 * Each step's status is reported via the onProgress callback so the UI can
 * update live. The orchestrator is non-destructive — existing non-empty repos
 * and duplicate pipelines are skipped, not overwritten.
 */
export async function runScaffold(
  projectId: string,
  template: DiscoveredTemplate,
  parameterValues: Record<string, unknown>,
  onProgress: ProgressCallback,
  /**
   * Pre-fetched permission flags for the current user. Callers should always
   * provide this; when omitted, permission checks are skipped and all resource
   * types are attempted regardless of the user's actual permissions.
   */
  permissions?: TemplatePermissions,
): Promise<ScaffoldResult[]> {
  const { definition: templateDefinition } = template;
  const viewValues = buildViewValues(templateDefinition, parameterValues);

  // Build the initial step list from scaffoldingSteps
  const allSteps: ScaffoldStep[] = templateDefinition.scaffoldingSteps.map((step) => ({
    id: `${step.type}:${step.name}`,
    label: buildStepLabel(step, viewValues),
    status: "pending" as StepStatus,
  }));
  onProgress([...allSteps]);

  const completedRepoNames = new Set<string>();

  for (let i = 0; i < templateDefinition.scaffoldingSteps.length; i++) {
    const step = templateDefinition.scaffoldingSteps[i];

    // Permission check
    if (isPermissionDenied(step.type, permissions)) {
      allSteps[i].status = "skipped";
      allSteps[i].detail = `Skipped: insufficient permissions to create ${step.type}.`;
      onProgress([...allSteps]);
      continue;
    }

    // Conditional when check
    if (step.when && !evaluateWhenExpression(step.when, viewValues)) {
      allSteps[i].status = "skipped";
      allSteps[i].detail = `Condition '${step.when}' was not met.`;
      onProgress([...allSteps]);
      continue;
    }

    allSteps[i].status = "running";
    allSteps[i].startTime = Date.now();
    onProgress([...allSteps]);

    const result = await executeStep(projectId, step, template, viewValues, completedRepoNames);

    allSteps[i].status = mapStatus(result.status);
    allSteps[i].duration = Date.now() - allSteps[i].startTime!;
    if (result.reason) allSteps[i].detail = result.reason;
    onProgress([...allSteps]);

    if (step.type === "repository" && result.status === "created") {
      completedRepoNames.add(renderTemplate(step.name, viewValues).toLowerCase());
    }
  }

  return [...allSteps];
}

function buildStepLabel(step: ScaffoldingStep, viewValues: Record<string, unknown>): string {
  const rendered = renderTemplate(step.name, viewValues);
  switch (step.type) {
    case "repository":
      return `Create repository: ${rendered}`;
    case "pipeline":
      return `Create pipeline: ${rendered}`;
    case "serviceConnection":
      return `Create service connection: ${rendered}`;
    case "variableGroup":
      return `Create variable group: ${rendered}`;
  }
}

function isPermissionDenied(type: ScaffoldingStep["type"], permissions?: TemplatePermissions): boolean {
  if (!permissions) return false;
  switch (type) {
    case "repository":
      return !permissions.canCreateRepos;
    case "pipeline":
      return !permissions.canCreatePipelines;
    case "serviceConnection":
      return !permissions.canCreateServiceConnections;
    case "variableGroup":
      return !permissions.canCreateVariableGroups;
  }
}

async function executeStep(
  projectId: string,
  step: ScaffoldingStep,
  template: DiscoveredTemplate,
  viewValues: Record<string, unknown>,
  completedRepoNames: Set<string>,
): Promise<{ status: "created" | "skipped" | "failed"; reason?: string }> {
  try {
    switch (step.type) {
      case "repository": {
        const r = await scaffoldRepository(projectId, step, template, viewValues);
        return { status: r.status, reason: r.reason };
      }
      case "pipeline": {
        const repoName = renderTemplate(step.repository, viewValues);
        if (!completedRepoNames.has(repoName.toLowerCase())) {
          return {
            status: "failed",
            reason: `Repository '${repoName}' was not created in a preceding step. Ensure a repository step with this name appears before this pipeline step.`,
          };
        }
        const p = await scaffoldPipeline(projectId, step, viewValues);
        return { status: p.status, reason: p.reason };
      }
      case "serviceConnection": {
        const sc = await scaffoldServiceConnection(projectId, step, viewValues);
        return { status: sc.status, reason: sc.reason };
      }
      case "variableGroup": {
        const vg = await scaffoldVariableGroup(projectId, step, viewValues);
        return { status: vg.status, reason: vg.reason };
      }
    }
  } catch (err) {
    return { status: "failed", reason: getErrorMessage(err) };
  }
}

function mapStatus(s: "created" | "skipped" | "failed"): StepStatus {
  if (s === "created") return "success";
  if (s === "skipped") return "skipped";
  return "failed";
}
