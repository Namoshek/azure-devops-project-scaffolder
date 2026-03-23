import * as SDK from "azure-devops-extension-sdk";
import { TemplatePipeline } from "../types/templateTypes";
import { renderTemplate } from "./templateEngineService";

export type PipelineScaffoldStatus = "created" | "skipped" | "failed";

export interface PipelineScaffoldResult {
  pipelineName: string;
  status: PipelineScaffoldStatus;
  reason?: string;
  pipelineId?: number;
}

/**
 * Creates a YAML pipeline build definition pointing to a repository.
 *
 * Non-destructive: if a pipeline with the same name already exists in the
 * target folder, returns "skipped".
 */
export async function scaffoldPipeline(
  projectId: string,
  pipelineTemplate: TemplatePipeline,
  parameterValues: Record<string, unknown>,
): Promise<PipelineScaffoldResult> {
  const pipelineName = renderTemplate(pipelineTemplate.name, parameterValues);
  const repoName = renderTemplate(pipelineTemplate.repository, parameterValues);
  const folder = pipelineTemplate.folder ?? "\\";

  const accessToken = await SDK.getAccessToken();
  const collection = SDK.getHost().name;

  // 1. Resolve the repository ID
  const repoId = await resolveRepoId(collection, projectId, repoName, accessToken);
  if (!repoId) {
    return {
      pipelineName,
      status: "failed",
      reason: `Repository '${repoName}' not found. Ensure it was created before the pipeline.`,
    };
  }

  // 2. Get the first available agent queue
  const queueId = await getDefaultQueueId(collection, projectId, accessToken);
  if (!queueId) {
    return {
      pipelineName,
      status: "failed",
      reason:
        "No agent queues found. At least one agent queue (e.g. 'Default') must exist.",
    };
  }

  // 3. Check if pipeline already exists
  const existsCheck = await fetch(
    `${window.location.origin}/${collection}/${projectId}/_apis/build/definitions?name=${encodeURIComponent(pipelineName)}&api-version=7.1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (existsCheck.ok) {
    const existsData: { count: number } = await existsCheck.json();
    if (existsData.count > 0) {
      return {
        pipelineName,
        status: "skipped",
        reason: `Pipeline '${pipelineName}' already exists.`,
      };
    }
  }

  // 4. Create the pipeline definition
  const definition = {
    name: pipelineName,
    path: folder,
    type: 2, // build
    queue: { id: queueId },
    process: {
      type: 2, // YAML
      yamlFilename: pipelineTemplate.yamlPath,
    },
    repository: {
      id: repoId,
      type: "TfsGit",
      name: repoName,
      defaultBranch: "refs/heads/main",
      clean: null,
      checkoutSubmodules: false,
    },
    triggers: [],
  };

  const createResponse = await fetch(
    `${window.location.origin}/${collection}/${projectId}/_apis/build/definitions?api-version=7.1`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(definition),
    },
  );

  if (!createResponse.ok) {
    const text = await createResponse.text();
    return {
      pipelineName,
      status: "failed",
      reason: `Failed to create pipeline: ${text}`,
    };
  }

  const created: { id: number } = await createResponse.json();
  return { pipelineName, status: "created", pipelineId: created.id };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function resolveRepoId(
  collection: string,
  projectId: string,
  repoName: string,
  accessToken: string,
): Promise<string | null> {
  const response = await fetch(
    `${window.location.origin}/${collection}/${projectId}/_apis/git/repositories?api-version=7.1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) return null;

  const data: { value: Array<{ id: string; name: string }> } =
    await response.json();
  const repo = data.value.find(
    (r) => r.name.toLowerCase() === repoName.toLowerCase(),
  );
  return repo?.id ?? null;
}

async function getDefaultQueueId(
  collection: string,
  projectId: string,
  accessToken: string,
): Promise<number | null> {
  const response = await fetch(
    `${window.location.origin}/${collection}/${projectId}/_apis/distributedtask/queues?api-version=7.1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) return null;

  const data: { value: Array<{ id: number; name: string }> } =
    await response.json();
  if (!data.value || data.value.length === 0) return null;

  // Prefer a queue named "Default"; otherwise take the first available
  const defaultQueue = data.value.find(
    (q) => q.name.toLowerCase() === "default",
  );
  return (defaultQueue ?? data.value[0]).id;
}
