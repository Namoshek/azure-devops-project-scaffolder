/* eslint-disable preserve-caught-error */
import { getClient } from "azure-devops-extension-api";
import { GitRestClient, VersionControlRecursionType } from "azure-devops-extension-api/Git";
import { parse } from "yaml";
import { ZodError } from "zod";
import { getErrorMessage } from "../utils/errorUtils";
import { TemplateDefinition } from "../types/templateTypes";
import { TemplateDefinitionSchema } from "../types/templateSchemas";

export interface ReadTemplateResult {
  definition: TemplateDefinition;
  /** Git commit SHA of the template file at the time it was read. */
  commitId: string;
}

/**
 * Fetches and parses a project-template.yml from a specific repository path
 * using the Git Items API. Returns both the parsed definition and the commit
 * SHA of the file so callers can record the exact version used.
 */
export async function readTemplateFromRepo(
  projectId: string,
  repoId: string,
  filePath: string,
): Promise<ReadTemplateResult> {
  const gitClient = getClient(GitRestClient);

  // Normalize path — Code Search returns paths like /project-template.yml
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;

  // getItem returns metadata including the commitId of the last commit that
  // touched this file; getItemText fetches the raw file content.
  const [item, content] = await Promise.all([
    gitClient.getItem(repoId, normalizedPath, projectId),
    gitClient.getItemText(repoId, normalizedPath, projectId),
  ]);

  return { definition: parseTemplateYaml(content), commitId: item.commitId ?? "" };
}

/**
 * Fetches all file items under a given sourcePath in a repository.
 * Returns an array of { path, content, isBase64 } objects for use by the
 * repository service when creating git push commits.
 *
 * Files are fetched in parallel (up to FETCH_CONCURRENCY concurrent requests)
 * to reduce total wall-clock time for repositories with many files.
 */
export async function fetchTemplateFiles(
  projectId: string,
  repoId: string,
  sourcePath: string,
): Promise<Array<{ path: string; content: string; isBase64: boolean }>> {
  const gitClient = getClient(GitRestClient);

  // List all items recursively under the sourcePath.
  const items = await gitClient.getItems(repoId, projectId, sourcePath, VersionControlRecursionType.Full);

  type FileResult = { path: string; content: string; isBase64: boolean } | null;

  const tasks = items
    .filter((item) => !item.isFolder)
    .map((file) => async (): Promise<FileResult> => {
      const filePath = file.path!;
      const isText = isTextFile(filePath);
      try {
        if (isText) {
          const content = await gitClient.getItemText(repoId, filePath, projectId);
          return { path: filePath, content, isBase64: false };
        } else {
          const buffer = await gitClient.getItemContent(repoId, filePath, projectId);
          return { path: filePath, content: arrayBufferToBase64(buffer), isBase64: true };
        }
      } catch (err) {
        console.warn(`Skipping file ${filePath}: ${getErrorMessage(err)}`);
        return null;
      }
    });

  const settled = await runConcurrently(tasks, FETCH_CONCURRENCY);
  return settled.filter((r): r is { path: string; content: string; isBase64: boolean } => r !== null);
}

/**
 * Lists all file paths under the given sourcePath without fetching content.
 * Returns quickly (single API call) and is used by the preview dialog to
 * build the file tree before content is lazily loaded on demand.
 */
export async function fetchTemplateFileList(
  projectId: string,
  repoId: string,
  sourcePath: string,
): Promise<Array<{ path: string; isText: boolean }>> {
  const gitClient = getClient(GitRestClient);
  const items = await gitClient.getItems(repoId, projectId, sourcePath, VersionControlRecursionType.Full);
  return items.filter((item) => !item.isFolder).map((item) => ({ path: item.path!, isText: isTextFile(item.path!) }));
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

const FETCH_CONCURRENCY = 10;

/**
 * Runs up to `concurrency` tasks simultaneously and preserves result order.
 * Safe in JS's single-threaded model: `nextIndex` is incremented synchronously
 * before each await, so no two workers ever claim the same slot.
 */
async function runConcurrently<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= tasks.length) break;
      results[index] = await tasks[index]();
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  if (workerCount > 0) {
    await Promise.all(Array.from({ length: workerCount }, worker));
  }
  return results;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".yml",
  ".yaml",
  ".md",
  ".txt",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".less",
  ".xml",
  ".csproj",
  ".props",
  ".targets",
  ".sln",
  ".cs",
  ".fs",
  ".vb",
  ".py",
  ".sh",
  ".ps1",
  ".psm1",
  ".psd1",
  ".tf",
  ".tfvars",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".dockerfile",
]);

function isTextFile(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return true; // no extension — assume text
  const ext = filePath.slice(dot).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

// ─── YAML parsing ─────────────────────────────────────────────────────────────

function parseTemplateYaml(raw: string): TemplateDefinition {
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new Error(`YAML parse error: ${getErrorMessage(err)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("project-template.yml must be a YAML object");
  }

  try {
    return TemplateDefinitionSchema.parse(parsed);
  } catch (err) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const path = first.path.join(".");
      throw new Error(`Template validation error: ${path ? path + ": " : ""}${first.message}`);
    }
    throw err;
  }
}
