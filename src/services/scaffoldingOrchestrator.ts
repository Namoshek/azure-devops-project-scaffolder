import { DiscoveredTemplate, TemplatePermissions } from "../types/templateTypes";
import { scaffoldRepository, RepoScaffoldResult } from "./repositoryService";
import { scaffoldPipeline, PipelineScaffoldResult } from "./pipelineService";
import { scaffoldServiceConnection, ServiceConnectionScaffoldResult } from "./serviceConnectionService";
import { scaffoldVariableGroup, VariableGroupScaffoldResult } from "./variableGroupService";
import { evaluateWhenExpression, renderTemplate } from "./templateEngineService";

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
  permissions?: TemplatePermissions,
): Promise<ScaffoldResult[]> {
  const { definition: templateDefinition, sourceProjectId, sourceRepoId } = template;

  // Build the initial step list
  const repoSteps: ScaffoldStep[] = templateDefinition.repositories.map((r) => ({
    id: `repo:${r.name}`,
    label: `Create repository: ${renderTemplate(r.name, parameterValues)}`,
    status: "pending",
  }));

  const serviceConnectionSteps: ScaffoldStep[] = templateDefinition.serviceConnections.map((sc) => ({
    id: `serviceconnection:${sc.name}`,
    label: `Create service connection: ${renderTemplate(sc.name, parameterValues)}`,
    status: "pending",
  }));

  const variableGroupSteps: ScaffoldStep[] = templateDefinition.variableGroups.map((vg) => ({
    id: `variablegroup:${vg.name}`,
    label: `Create variable group: ${renderTemplate(vg.name, parameterValues)}`,
    status: "pending",
  }));

  const pipelineSteps: ScaffoldStep[] = templateDefinition.pipelines.map((p) => ({
    id: `pipeline:${p.name}`,
    label: `Create pipeline: ${renderTemplate(p.name, parameterValues)}`,
    status: "pending",
  }));

  const allSteps: ScaffoldStep[] = [...repoSteps, ...serviceConnectionSteps, ...variableGroupSteps, ...pipelineSteps];
  onProgress([...allSteps]);

  // ── Phase 1: Repositories ────────────────────────────────────────────────────
  if (permissions && !permissions.canCreateRepos && repoSteps.length > 0) {
    for (const step of repoSteps) {
      step.status = "skipped";
      step.detail = "Skipped: insufficient permissions to create repositories.";
    }
    onProgress([...allSteps]);
  }

  for (let i = 0; i < repoSteps.length; i++) {
    if (repoSteps[i].status === "skipped") continue;
    const repoTemplate = templateDefinition.repositories[i];

    // Skip this repository if its when condition is not satisfied
    if (repoTemplate.when && !evaluateWhenExpression(repoTemplate.when, parameterValues)) {
      repoSteps[i].status = "skipped";
      repoSteps[i].detail = `Condition '${repoTemplate.when}' was not met.`;
      onProgress([...allSteps]);
      continue;
    }

    repoSteps[i].status = "running";
    repoSteps[i].startTime = Date.now();
    onProgress([...allSteps]);

    let result: RepoScaffoldResult;
    try {
      result = await scaffoldRepository(projectId, repoTemplate, sourceProjectId, sourceRepoId, parameterValues);
    } catch (err) {
      result = {
        repoName: repoTemplate.name,
        status: "failed",
        reason: (err as Error).message,
      };
    }

    repoSteps[i].status = mapStatus(result.status);
    repoSteps[i].duration = Date.now() - repoSteps[i].startTime!;
    if (result.reason) repoSteps[i].detail = result.reason;
    onProgress([...allSteps]);
  }

  // ── Phase 2: Service Connections ────────────────────────────────────────────
  if (permissions && !permissions.canCreateServiceConnections && serviceConnectionSteps.length > 0) {
    for (const step of serviceConnectionSteps) {
      step.status = "skipped";
      step.detail = "Skipped: insufficient permissions to create service connections.";
    }
    onProgress([...allSteps]);
  }

  for (let i = 0; i < serviceConnectionSteps.length; i++) {
    if (serviceConnectionSteps[i].status === "skipped") continue;
    const connectionTemplate = templateDefinition.serviceConnections[i];

    if (connectionTemplate.when && !evaluateWhenExpression(connectionTemplate.when, parameterValues)) {
      serviceConnectionSteps[i].status = "skipped";
      serviceConnectionSteps[i].detail = `Condition '${connectionTemplate.when}' was not met.`;
      onProgress([...allSteps]);
      continue;
    }

    serviceConnectionSteps[i].status = "running";
    serviceConnectionSteps[i].startTime = Date.now();
    onProgress([...allSteps]);

    let result: ServiceConnectionScaffoldResult;
    try {
      result = await scaffoldServiceConnection(projectId, connectionTemplate, parameterValues);
    } catch (err) {
      result = {
        connectionName: connectionTemplate.name,
        status: "failed",
        reason: (err as Error).message,
      };
    }

    serviceConnectionSteps[i].status = mapStatus(result.status);
    serviceConnectionSteps[i].duration = Date.now() - serviceConnectionSteps[i].startTime!;
    if (result.reason) serviceConnectionSteps[i].detail = result.reason;
    onProgress([...allSteps]);
  }

  // ── Phase 3: Variable Groups ─────────────────────────────────────────────────
  if (permissions && !permissions.canCreateVariableGroups && variableGroupSteps.length > 0) {
    for (const step of variableGroupSteps) {
      step.status = "skipped";
      step.detail = "Skipped: insufficient permissions to create variable groups.";
    }
    onProgress([...allSteps]);
  }

  for (let i = 0; i < variableGroupSteps.length; i++) {
    if (variableGroupSteps[i].status === "skipped") continue;
    const groupTemplate = templateDefinition.variableGroups[i];

    if (groupTemplate.when && !evaluateWhenExpression(groupTemplate.when, parameterValues)) {
      variableGroupSteps[i].status = "skipped";
      variableGroupSteps[i].detail = `Condition '${groupTemplate.when}' was not met.`;
      onProgress([...allSteps]);
      continue;
    }

    variableGroupSteps[i].status = "running";
    variableGroupSteps[i].startTime = Date.now();
    onProgress([...allSteps]);

    let result: VariableGroupScaffoldResult;
    try {
      result = await scaffoldVariableGroup(projectId, groupTemplate, parameterValues);
    } catch (err) {
      result = {
        groupName: groupTemplate.name,
        status: "failed",
        reason: (err as Error).message,
      };
    }

    variableGroupSteps[i].status = mapStatus(result.status);
    variableGroupSteps[i].duration = Date.now() - variableGroupSteps[i].startTime!;
    if (result.reason) variableGroupSteps[i].detail = result.reason;
    onProgress([...allSteps]);
  }

  // ── Phase 4: Pipelines ───────────────────────────────────────────────────────
  if (permissions && !permissions.canCreatePipelines && pipelineSteps.length > 0) {
    for (const step of pipelineSteps) {
      step.status = "skipped";
      step.detail = "Skipped: insufficient permissions to create pipeline definitions.";
    }
    onProgress([...allSteps]);
  }

  for (let i = 0; i < pipelineSteps.length; i++) {
    if (pipelineSteps[i].status === "skipped") continue;
    const pipelineTemplate = templateDefinition.pipelines[i];

    // Skip this pipeline if its when condition is not satisfied
    if (pipelineTemplate.when && !evaluateWhenExpression(pipelineTemplate.when, parameterValues)) {
      pipelineSteps[i].status = "skipped";
      pipelineSteps[i].detail = `Condition '${pipelineTemplate.when}' was not met.`;
      onProgress([...allSteps]);
      continue;
    }

    pipelineSteps[i].status = "running";
    pipelineSteps[i].startTime = Date.now();
    onProgress([...allSteps]);

    let result: PipelineScaffoldResult;
    try {
      result = await scaffoldPipeline(projectId, pipelineTemplate, parameterValues);
    } catch (err) {
      result = {
        pipelineName: pipelineTemplate.name,
        status: "failed",
        reason: (err as Error).message,
      };
    }

    pipelineSteps[i].status = mapStatus(result.status);
    pipelineSteps[i].duration = Date.now() - pipelineSteps[i].startTime!;
    if (result.reason) pipelineSteps[i].detail = result.reason;
    onProgress([...allSteps]);
  }

  return [...allSteps];
}

function mapStatus(s: "created" | "skipped" | "failed"): StepStatus {
  if (s === "created") return "success";
  if (s === "skipped") return "skipped";
  return "failed";
}
