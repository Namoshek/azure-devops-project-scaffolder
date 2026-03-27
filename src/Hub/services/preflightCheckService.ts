import { getClient } from "azure-devops-extension-api";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { BuildRestClient } from "azure-devops-extension-api/Build";
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

export interface ResourceExistenceMap {
  /** Keyed by the rendered (final) repository name (lower-cased). */
  repos: Record<string, RepoExistenceResult>;
  /**
   * Keyed by `"${folder.toLowerCase()}::${name.toLowerCase()}"` to reflect
   * that pipeline uniqueness in ADO is (folder, name), not name alone.
   */
  pipelines: Record<string, PipelineExistenceResult>;
}

// ─── Module-level cache ────────────────────────────────────────────────────────

const _cache = new Map<string, RepoExistenceResult | PipelineExistenceResult>();

function repoCacheKey(projectId: string, repoName: string): string {
  return `repo:${projectId}:${repoName.toLowerCase()}`;
}

function pipelineCacheKey(
  projectId: string,
  pipelineName: string,
  folder: string,
): string {
  return `pipeline:${projectId}:${folder.toLowerCase()}:${pipelineName.toLowerCase()}`;
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
    const existing = repos.find(
      (r) => r.name?.toLowerCase() === repoName.toLowerCase(),
    );

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
 * Batch-checks existence of all repositories and pipelines from a template,
 * rendering names against the provided parameter values first.
 *
 * All checks run in parallel for performance.  Uses the cache by default
 * (no `fresh` flag — the preview does not need live data).
 */
export async function checkTemplateResourcesExistence(
  projectId: string,
  template: TemplateDefinition,
  paramValues: Record<string, unknown>,
): Promise<ResourceExistenceMap> {
  const repoEntries = (template.repositories ?? []).map((r) => ({
    key: renderTemplate(r.name, paramValues).toLowerCase(),
    rendered: renderTemplate(r.name, paramValues),
  }));

  const pipelineEntries = (template.pipelines ?? []).map((p) => {
    const renderedName = renderTemplate(p.name, paramValues);
    const folder = p.folder ?? "\\";
    return {
      key: `${folder.toLowerCase()}::${renderedName.toLowerCase()}`,
      rendered: renderedName,
      folder,
    };
  });

  const [repoResults, pipelineResults] = await Promise.all([
    Promise.all(repoEntries.map((e) => checkRepoExists(projectId, e.rendered))),
    Promise.all(
      pipelineEntries.map((e) =>
        checkPipelineExists(projectId, e.rendered, e.folder),
      ),
    ),
  ]);

  const repos: Record<string, RepoExistenceResult> = {};
  for (let i = 0; i < repoEntries.length; i++) {
    repos[repoEntries[i].key] = repoResults[i];
  }

  const pipelines: Record<string, PipelineExistenceResult> = {};
  for (let i = 0; i < pipelineEntries.length; i++) {
    pipelines[pipelineEntries[i].key] = pipelineResults[i];
  }

  return { repos, pipelines };
}
