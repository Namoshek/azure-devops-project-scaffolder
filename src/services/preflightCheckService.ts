import { getClient } from "azure-devops-extension-api";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { BuildRestClient } from "azure-devops-extension-api/Build";
import { ServiceEndpointRestClient } from "azure-devops-extension-api/ServiceEndpoint";
import { TaskAgentRestClient } from "azure-devops-extension-api/TaskAgent";
import { TemplateDefinition } from "../types/templateTypes";
import { renderTemplate } from "./templateEngineService";

// ─── Result types ──────────────────────────────────────────────────────────────

export interface RepoExistenceResult {
  exists: boolean;
  /** True only when the repo exists and has at least one commit/ref. */
  isNonEmpty: boolean;
}

export interface PipelineExistenceResult {
  exists: boolean;
}

export interface ServiceConnectionExistenceResult {
  exists: boolean;
}

export interface VariableGroupExistenceResult {
  exists: boolean;
}

export interface ResourceExistenceMap {
  /** Keyed by the rendered (final) repository name (lower-cased). */
  repos: Record<string, RepoExistenceResult>;
  /**
   * Keyed by `"${folder.toLowerCase()}::${name.toLowerCase()}"` to reflect
   * that pipeline uniqueness in ADO is (folder, name), not name alone.
   */
  pipelines: Record<string, PipelineExistenceResult>;
  /** Keyed by the rendered (final) connection name (lower-cased). */
  serviceConnections: Record<string, ServiceConnectionExistenceResult>;
  /** Keyed by the rendered (final) variable group name (lower-cased). */
  variableGroups: Record<string, VariableGroupExistenceResult>;
}

// ─── Module-level cache ────────────────────────────────────────────────────────

const _cache = new Map<
  string,
  RepoExistenceResult | PipelineExistenceResult | ServiceConnectionExistenceResult | VariableGroupExistenceResult
>();

function repoCacheKey(projectId: string, repoName: string): string {
  return `repo:${projectId}:${repoName.toLowerCase()}`;
}

function pipelineCacheKey(projectId: string, pipelineName: string, folder: string): string {
  return `pipeline:${projectId}:${folder.toLowerCase()}:${pipelineName.toLowerCase()}`;
}

function serviceConnectionCacheKey(projectId: string, connectionName: string): string {
  return `serviceconnection:${projectId}:${connectionName.toLowerCase()}`;
}

function variableGroupCacheKey(projectId: string, groupName: string): string {
  return `variablegroup:${projectId}:${groupName.toLowerCase()}`;
}

// ─── Public exports ────────────────────────────────────────────────────────────

/**
 * Checks whether a repository with the given name exists in the project, and
 * whether it is non-empty (has at least one ref/commit).
 *
 * Results are cached by default. Pass `{ fresh: true }` to bypass the cache
 * (the fresh result is still written back so subsequent preview calls benefit).
 * This is used during actual scaffolding to ensure the check is always current.
 *
 * Fails open: returns `{ exists: false, isNonEmpty: false }` on any error so
 * that errors never block the preview UI or the submit button.
 */
export async function checkRepoExists(
  projectId: string,
  repoName: string,
  opts: { fresh?: boolean } = {},
): Promise<RepoExistenceResult> {
  const key = repoCacheKey(projectId, repoName);

  if (!opts.fresh && _cache.has(key)) {
    return _cache.get(key) as RepoExistenceResult;
  }

  let result: RepoExistenceResult;
  try {
    const gitClient = getClient(GitRestClient);
    const repos = await gitClient.getRepositories(projectId);
    const existing = repos.find((r) => r.name?.toLowerCase() === repoName.toLowerCase());

    if (!existing) {
      result = { exists: false, isNonEmpty: false };
    } else {
      let isNonEmpty = false;
      try {
        const refs = await gitClient.getRefs(existing.id!, projectId, "heads");
        isNonEmpty = refs.length > 0;
      } catch {
        // If ref listing fails, treat repo as empty so scaffolding can proceed.
      }
      result = { exists: true, isNonEmpty };
    }
  } catch {
    result = { exists: false, isNonEmpty: false };
  }

  _cache.set(key, result);
  return result;
}

/**
 * Checks whether a pipeline definition with the given name exists in the
 * given folder of the project.
 *
 * In ADO, pipeline uniqueness is `(folder, name)` — two pipelines can share
 * the same name as long as they live in different folders. The `folder`
 * parameter defaults to `"\\"` (root), which matches the default used when
 * creating a pipeline without an explicit folder.
 *
 * Caching and `fresh` semantics are identical to `checkRepoExists`.
 * Fails open.
 */
export async function checkPipelineExists(
  projectId: string,
  pipelineName: string,
  folder: string = "\\",
  opts: { fresh?: boolean } = {},
): Promise<PipelineExistenceResult> {
  const key = pipelineCacheKey(projectId, pipelineName, folder);

  if (!opts.fresh && _cache.has(key)) {
    return _cache.get(key) as PipelineExistenceResult;
  }

  let result: PipelineExistenceResult;
  try {
    const buildClient = getClient(BuildRestClient);
    // getDefinitions supports server-side name + path (folder) filtering.
    // Passing both avoids fetching unrelated definitions and correctly scopes
    // uniqueness to the (folder, name) combination.
    const existing = await buildClient.getDefinitions(
      projectId,
      pipelineName,
      undefined, // repositoryId
      undefined, // repositoryType
      undefined, // queryOrder
      undefined, // $top
      undefined, // continuationToken
      undefined, // minMetricsTime
      undefined, // definitionIds
      folder, // path (folder)
    );
    result = { exists: existing.length > 0 };
  } catch {
    result = { exists: false };
  }

  _cache.set(key, result);
  return result;
}

/**
 * Checks whether a service connection with the given name already exists in the project.
 *
 * Caching and `fresh` semantics are identical to `checkRepoExists`.
 * Fails open: returns `{ exists: false }` on any error.
 */
export async function checkServiceConnectionExists(
  projectId: string,
  connectionName: string,
  opts: { fresh?: boolean } = {},
): Promise<ServiceConnectionExistenceResult> {
  const key = serviceConnectionCacheKey(projectId, connectionName);

  if (!opts.fresh && _cache.has(key)) {
    return _cache.get(key) as ServiceConnectionExistenceResult;
  }

  let result: ServiceConnectionExistenceResult;
  try {
    const client = getClient(ServiceEndpointRestClient);
    const endpoints = await client.getServiceEndpointsByNames(projectId, [connectionName]);
    result = { exists: endpoints.length > 0 };
  } catch {
    result = { exists: false };
  }

  _cache.set(key, result);
  return result;
}

/**
 * Checks whether a variable group with the given name already exists in the project's Library.
 *
 * Caching and `fresh` semantics are identical to `checkRepoExists`.
 * Fails open: returns `{ exists: false }` on any error.
 */
export async function checkVariableGroupExists(
  projectId: string,
  groupName: string,
  opts: { fresh?: boolean } = {},
): Promise<VariableGroupExistenceResult> {
  const key = variableGroupCacheKey(projectId, groupName);

  if (!opts.fresh && _cache.has(key)) {
    return _cache.get(key) as VariableGroupExistenceResult;
  }

  let result: VariableGroupExistenceResult;
  try {
    const client = getClient(TaskAgentRestClient);
    const groups = await client.getVariableGroups(projectId, groupName);
    result = { exists: groups.length > 0 };
  } catch {
    result = { exists: false };
  }

  _cache.set(key, result);
  return result;
}

/**
 * Batch-checks existence of all repositories, service connections, variable groups, and
 * pipelines from a template, rendering names against the provided parameter
 * values first.
 *
 * All checks run in parallel for performance. Uses the cache by default
 * (no `fresh` flag — the preview does not need live data).
 */
export async function checkTemplateResourcesExistence(
  projectId: string,
  template: TemplateDefinition,
  paramValues: Record<string, unknown>,
): Promise<ResourceExistenceMap> {
  const repositoryEntries = (template.repositories ?? []).map((r) => {
    const renderedName = renderTemplate(r.name, paramValues);
    return {
      key: renderedName.toLowerCase(),
      rendered: renderedName,
    };
  });

  const pipelineEntries = (template.pipelines ?? []).map((p) => {
    const renderedName = renderTemplate(p.name, paramValues);
    const folder = p.folder ?? "\\";
    return {
      key: `${folder.toLowerCase()}::${renderedName.toLowerCase()}`,
      rendered: renderedName,
      folder,
    };
  });

  const serviceConnectionEntries = (template.serviceConnections ?? []).map((sc) => {
    const renderedName = renderTemplate(sc.name, paramValues);
    return {
      key: renderedName.toLowerCase(),
      rendered: renderedName,
    };
  });

  const variableGroupEntries = (template.variableGroups ?? []).map((vg) => {
    const renderedName = renderTemplate(vg.name, paramValues);
    return {
      key: renderedName.toLowerCase(),
      rendered: renderedName,
    };
  });

  const [repositoryResults, pipelineResults, serviceConnectionResults, variableGroupResults] = await Promise.all([
    Promise.all(repositoryEntries.map((e) => checkRepoExists(projectId, e.rendered))),
    Promise.all(pipelineEntries.map((e) => checkPipelineExists(projectId, e.rendered, e.folder))),
    Promise.all(serviceConnectionEntries.map((e) => checkServiceConnectionExists(projectId, e.rendered))),
    Promise.all(variableGroupEntries.map((e) => checkVariableGroupExists(projectId, e.rendered))),
  ]);

  const repositories: Record<string, RepoExistenceResult> = {};
  for (let i = 0; i < repositoryEntries.length; i++) {
    repositories[repositoryEntries[i].key] = repositoryResults[i];
  }

  const pipelines: Record<string, PipelineExistenceResult> = {};
  for (let i = 0; i < pipelineEntries.length; i++) {
    pipelines[pipelineEntries[i].key] = pipelineResults[i];
  }

  const serviceConnections: Record<string, ServiceConnectionExistenceResult> = {};
  for (let i = 0; i < serviceConnectionEntries.length; i++) {
    serviceConnections[serviceConnectionEntries[i].key] = serviceConnectionResults[i];
  }

  const variableGroups: Record<string, VariableGroupExistenceResult> = {};
  for (let i = 0; i < variableGroupEntries.length; i++) {
    variableGroups[variableGroupEntries[i].key] = variableGroupResults[i];
  }

  return { repos: repositories, pipelines, serviceConnections, variableGroups };
}
