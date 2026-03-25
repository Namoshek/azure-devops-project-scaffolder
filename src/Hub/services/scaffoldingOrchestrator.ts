import { TemplateDefinition } from "../types/templateTypes";
import { scaffoldRepository, RepoScaffoldResult } from "./repositoryService";
import { scaffoldPipeline, PipelineScaffoldResult } from "./pipelineService";
import {
  evaluateWhenExpression,
  renderTemplate,
} from "./templateEngineService";

export type StepStatus =
  | "pending"
  | "running"
  | "success"
  | "skipped"
  | "failed";

export interface ScaffoldStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
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
  template: TemplateDefinition,
  parameterValues: Record<string, unknown>,
  onProgress: ProgressCallback,
): Promise<ScaffoldResult[]> {
  const sourceProjectId = template._sourceProjectId!;
  const sourceRepoId = template._sourceRepoId!;

  // Build the initial step list
  const repoSteps: ScaffoldStep[] = (template.repositories ?? []).map((r) => ({
    id: `repo:${r.name}`,
    label: `Create repository: ${renderTemplate(r.name, parameterValues)}`,
    status: "pending",
  }));

  const pipelineSteps: ScaffoldStep[] = (template.pipelines ?? []).map((p) => ({
    id: `pipeline:${p.name}`,
    label: `Create pipeline: ${renderTemplate(p.name, parameterValues)}`,
    status: "pending",
  }));

  const allSteps: ScaffoldStep[] = [...repoSteps, ...pipelineSteps];
  onProgress([...allSteps]);

  // ── Phase 1: Repositories ────────────────────────────────────────────────────
  for (let i = 0; i < repoSteps.length; i++) {
    const repoTemplate = template.repositories![i];

    // Skip this repository if its when condition is not satisfied
    if (
      repoTemplate.when &&
      !evaluateWhenExpression(repoTemplate.when, parameterValues)
    ) {
      repoSteps[i].status = "skipped";
      repoSteps[i].detail = `Condition '${repoTemplate.when}' was not met.`;
      onProgress([...allSteps]);
      continue;
    }

    repoSteps[i].status = "running";
    onProgress([...allSteps]);

    let result: RepoScaffoldResult;
    try {
      result = await scaffoldRepository(
        projectId,
        repoTemplate,
        sourceProjectId,
        sourceRepoId,
        parameterValues,
      );
    } catch (err) {
      result = {
        repoName: repoTemplate.name,
        status: "failed",
        reason: (err as Error).message,
      };
    }

    repoSteps[i].status = mapStatus(result.status);
    if (result.reason) repoSteps[i].detail = result.reason;
    onProgress([...allSteps]);
  }

  // ── Phase 2: Pipelines ───────────────────────────────────────────────────────
  for (let i = 0; i < pipelineSteps.length; i++) {
    const pipelineTemplate = template.pipelines![i];

    // Skip this pipeline if its when condition is not satisfied
    if (
      pipelineTemplate.when &&
      !evaluateWhenExpression(pipelineTemplate.when, parameterValues)
    ) {
      pipelineSteps[i].status = "skipped";
      pipelineSteps[i].detail =
        `Condition '${pipelineTemplate.when}' was not met.`;
      onProgress([...allSteps]);
      continue;
    }

    pipelineSteps[i].status = "running";
    onProgress([...allSteps]);

    let result: PipelineScaffoldResult;
    try {
      result = await scaffoldPipeline(
        projectId,
        pipelineTemplate,
        parameterValues,
      );
    } catch (err) {
      result = {
        pipelineName: pipelineTemplate.name,
        status: "failed",
        reason: (err as Error).message,
      };
    }

    pipelineSteps[i].status = mapStatus(result.status);
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
