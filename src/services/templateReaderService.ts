/* eslint-disable preserve-caught-error */
import { getClient } from "azure-devops-extension-api";
import { GitRestClient, VersionControlRecursionType } from "azure-devops-extension-api/Git";
import { parse } from "yaml";
import { ZodError } from "zod";
import { TemplateDefinition } from "../types/templateTypes";
import { TemplateDefinitionSchema } from "../types/templateSchemas";

/**
 * Fetches and parses a project-template.yml from a specific repository path
 * using the Git Items API.
 */
export async function readTemplateFromRepo(
  projectId: string,
  repoId: string,
  filePath: string,
): Promise<TemplateDefinition> {
  const gitClient = getClient(GitRestClient);

  // Normalize path — Code Search returns paths like /project-template.yml
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;

  const content = await gitClient.getItemText(repoId, normalizedPath, projectId);
  return parseTemplateYaml(content);
}

/**
 * Fetches all file items under a given sourcePath in a repository.
 * Returns an array of { path, content, isBase64 } objects for use by the
 * repository service when creating git push commits.
 */
export async function fetchTemplateFiles(
  projectId: string,
  repoId: string,
  sourcePath: string,
): Promise<Array<{ path: string; content: string; isBase64: boolean }>> {
  const gitClient = getClient(GitRestClient);

  // List all items recursively under the sourcePath.
  const items = await gitClient.getItems(repoId, projectId, sourcePath, VersionControlRecursionType.Full);

  const files = items.filter((item) => !item.isFolder);
  const results: Array<{ path: string; content: string; isBase64: boolean }> = [];

  for (const file of files) {
    const filePath = file.path!;
    const isText = isTextFile(filePath);

    try {
      if (isText) {
        const content = await gitClient.getItemText(repoId, filePath, projectId);
        results.push({ path: filePath, content, isBase64: false });
      } else {
        const buffer = await gitClient.getItemContent(repoId, filePath, projectId);
        results.push({
          path: filePath,
          content: arrayBufferToBase64(buffer),
          isBase64: true,
        });
      }
    } catch (err) {
      console.warn(`Skipping file ${filePath}: ${(err as Error).message}`);
    }
  }

  return results;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

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
    throw new Error(`YAML parse error: ${(err as Error).message}`);
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
