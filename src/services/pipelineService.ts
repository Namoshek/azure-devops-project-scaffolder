import { getClient } from "azure-devops-extension-api";
import {
  BuildRestClient,
  BuildDefinition,
  BuildDefinitionVariable,
  DefinitionType,
  YamlProcess,
  AgentPoolQueue,
  BuildRepository,
} from "azure-devops-extension-api/Build";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { TaskAgentRestClient } from "azure-devops-extension-api/TaskAgent";
import { renderTemplate } from "./templateEngineService";
import { checkPipelineExists } from "./preflightCheckService";
import { TemplatePipeline } from "../types/templateTypes";
import { getErrorMessage } from "../utils/errorUtils";

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

  const gitClient = getClient(GitRestClient);
  const buildClient = getClient(BuildRestClient);
  const taskAgentClient = getClient(TaskAgentRestClient);

  // 1. Resolve the repository ID
  const repoId = await resolveRepoId(gitClient, projectId, repoName);
  if (!repoId) {
    return {
      pipelineName,
      status: "failed",
      reason: `Repository '${repoName}' not found. Ensure it was created before the pipeline.`,
    };
  }

  // 2. Get the first available agent queue
  const queueId = await getDefaultQueueId(taskAgentClient, projectId);
  if (!queueId) {
    return {
      pipelineName,
      status: "failed",
      reason: "No agent queues found. At least one agent queue (e.g. 'Default') must exist.",
    };
  }

  // 3. Check if pipeline already exists (fresh=true bypasses preview cache)
  const { exists: pipelineExists } = await checkPipelineExists(projectId, pipelineName, folder, { fresh: true });
  if (pipelineExists) {
    return {
      pipelineName,
      status: "skipped",
      reason: `Pipeline '${pipelineName}' already exists.`,
    };
  }

  // 4. Build the variables map (undefined when no variables are declared)
  const variables = buildVariablesMap(pipelineTemplate, parameterValues);

  // 5. Create the pipeline definition
  const definition: BuildDefinition = {
    name: pipelineName,
    path: folder,
    type: DefinitionType.Build,
    queue: { id: queueId } as AgentPoolQueue,
    process: {
      type: 2, // YAML process type
      yamlFilename: pipelineTemplate.yamlPath,
    } as YamlProcess,
    repository: {
      id: repoId,
      type: "TfsGit",
      name: repoName,
      defaultBranch: "refs/heads/main",
      checkoutSubmodules: false,
    } as BuildRepository,
    triggers: [],
    ...(variables !== undefined && { variables }),
  } as unknown as BuildDefinition;

  let created: BuildDefinition;
  try {
    created = await buildClient.createDefinition(definition, projectId);
  } catch (err) {
    return {
      pipelineName,
      status: "failed",
      reason: `Failed to create pipeline: ${getErrorMessage(err)}`,
    };
  }

  return { pipelineName, status: "created", pipelineId: created.id };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildVariablesMap(
  pipelineTemplate: TemplatePipeline,
  parameterValues: Record<string, unknown>,
): Record<string, BuildDefinitionVariable> | undefined {
  if (!pipelineTemplate.variables || pipelineTemplate.variables.length === 0) {
    return undefined;
  }
  const map: Record<string, BuildDefinitionVariable> = {};
  for (const variable of pipelineTemplate.variables) {
    const name = renderTemplate(variable.name, parameterValues);
    const value = renderTemplate(variable.value, parameterValues);
    map[name] = { value, isSecret: variable.secret ?? false, allowOverride: false };
  }
  return map;
}

async function resolveRepoId(gitClient: GitRestClient, projectId: string, repoName: string): Promise<string | null> {
  try {
    const repos = await gitClient.getRepositories(projectId);
    const repo = repos.find((r) => r.name?.toLowerCase() === repoName.toLowerCase());
    return repo?.id ?? null;
  } catch (err) {
    console.error(`Failed to resolve repository id for '${repoName}':`, err);
    return null;
  }
}

async function getDefaultQueueId(taskAgentClient: TaskAgentRestClient, projectId: string): Promise<number | null> {
  try {
    const queues = await taskAgentClient.getAgentQueues(projectId);
    if (!queues || queues.length === 0) return null;
    // Prefer a queue named "Default"; otherwise take the first available
    const defaultQueue = queues.find((q) => q.name?.toLowerCase() === "default");
    return (defaultQueue ?? queues[0]).id;
  } catch (err) {
    console.error("Failed to retrieve agent queues:", err);
    return null;
  }
}
