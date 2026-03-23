import * as SDK from "azure-devops-extension-sdk";
import * as yaml from "js-yaml";
import { TemplateDefinition, TemplateParameter } from "../types/templateTypes";

/**
 * Fetches and parses a project-template.yml from a specific repository path
 * using the Git Items API.
 */
export async function readTemplateFromRepo(
  projectId: string,
  repoId: string,
  filePath: string,
): Promise<TemplateDefinition> {
  const accessToken = await SDK.getAccessToken();

  // Normalize path — Code Search returns paths like /project-template.yml
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;

  const url =
    `${window.location.origin}/${projectId}/_apis/git/repositories/${repoId}/items` +
    `?path=${encodeURIComponent(normalizedPath)}&includeContent=true&api-version=7.1`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch template file (${response.status}): ${response.statusText}`,
    );
  }

  const content = await response.text();
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
  const accessToken = await SDK.getAccessToken();

  // First, list all items under the sourcePath recursively
  const listUrl =
    `${window.location.origin}/${projectId}/_apis/git/repositories/${repoId}/items` +
    `?scopePath=${encodeURIComponent(sourcePath)}&recursionLevel=Full&api-version=7.1`;

  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listResponse.ok) {
    throw new Error(
      `Failed to list template files at '${sourcePath}' (${listResponse.status}): ${listResponse.statusText}`,
    );
  }

  const listData: {
    value: Array<{ path: string; isFolder: boolean; gitObjectType: string }>;
  } = await listResponse.json();

  const files = listData.value.filter(
    (item) => !item.isFolder && item.gitObjectType === "blob",
  );

  const results: Array<{ path: string; content: string; isBase64: boolean }> =
    [];

  for (const file of files) {
    const isText = isTextFile(file.path);

    const fileUrl =
      `${window.location.origin}/${projectId}/_apis/git/repositories/${repoId}/items` +
      `?path=${encodeURIComponent(file.path)}` +
      `&includeContent=true` +
      (!isText ? `&$format=base64Encoded` : "") +
      `&api-version=7.1`;

    const fileResponse = await fetch(fileUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!fileResponse.ok) {
      console.warn(`Skipping file ${file.path}: ${fileResponse.statusText}`);
      continue;
    }

    const content = await fileResponse.text();
    results.push({ path: file.path, content, isBase64: !isText });
  }

  return results;
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

function parseTemplateYaml(raw: string): TemplateDefinition {
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`YAML parse error: ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("project-template.yml must be a YAML object");
  }

  const obj = parsed as Record<string, unknown>;

  assertString(obj, "id");
  assertString(obj, "name");
  assertString(obj, "version");

  const parameters = parseParameters(obj.parameters);

  const definition: TemplateDefinition = {
    id: obj.id as string,
    name: obj.name as string,
    version: obj.version as string,
    description:
      typeof obj.description === "string" ? obj.description : undefined,
    maintainers: Array.isArray(obj.maintainers)
      ? (obj.maintainers as string[])
      : undefined,
    parameters,
    repositories: Array.isArray(obj.repositories)
      ? (obj.repositories as TemplateDefinition["repositories"])
      : [],
    pipelines: Array.isArray(obj.pipelines)
      ? (obj.pipelines as TemplateDefinition["pipelines"])
      : [],
    teams: Array.isArray(obj.teams)
      ? (obj.teams as TemplateDefinition["teams"])
      : [],
  };

  return definition;
}

function assertString(obj: Record<string, unknown>, key: string): void {
  if (typeof obj[key] !== "string" || !(obj[key] as string).trim()) {
    throw new Error(
      `project-template.yml must have a non-empty string field: '${key}'`,
    );
  }
}

function parseParameters(raw: unknown): TemplateParameter[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`parameters[${index}] must be an object`);
    }
    const p = item as Record<string, unknown>;
    if (typeof p.id !== "string")
      throw new Error(`parameters[${index}].id must be a string`);
    if (typeof p.label !== "string")
      throw new Error(`parameters[${index}].label must be a string`);

    const type = p.type as string;
    if (!["string", "boolean", "choice"].includes(type)) {
      throw new Error(
        `parameters[${index}].type must be 'string', 'boolean', or 'choice'`,
      );
    }

    const param: TemplateParameter = {
      id: p.id,
      label: p.label,
      type: type as TemplateParameter["type"],
    };

    if (typeof p.hint === "string") param.hint = p.hint;
    if (typeof p.required === "boolean") param.required = p.required;
    if (p.defaultValue !== undefined)
      param.defaultValue = p.defaultValue as string | boolean;
    if (Array.isArray(p.options)) param.options = p.options as string[];
    if (typeof p.secret === "boolean") param.secret = p.secret;
    if (typeof p.when === "string") param.when = p.when;
    if (p.validation && typeof p.validation === "object") {
      const v = p.validation as Record<string, unknown>;
      if (typeof v.regex === "string" && typeof v.message === "string") {
        param.validation = { regex: v.regex, message: v.message };
      }
    }

    return param;
  });
}
