import { getClient } from "azure-devops-extension-api";
import {
  GitRestClient,
  VersionControlRecursionType,
} from "azure-devops-extension-api/Git";
import * as yaml from "js-yaml";
import {
  TemplateDefinition,
  TemplateParameter,
  TemplateRepository,
  TemplateFileExclude,
  TemplatePipeline,
} from "../types/templateTypes";

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

  const content = await gitClient.getItemText(
    repoId,
    normalizedPath,
    projectId,
  );
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
  const items = await gitClient.getItems(
    repoId,
    projectId,
    sourcePath,
    VersionControlRecursionType.Full,
  );

  const files = items.filter((item) => !item.isFolder);
  const results: Array<{ path: string; content: string; isBase64: boolean }> =
    [];

  for (const file of files) {
    const filePath = file.path!;
    const isText = isTextFile(filePath);

    try {
      if (isText) {
        const content = await gitClient.getItemText(
          repoId,
          filePath,
          projectId,
        );
        results.push({ path: filePath, content, isBase64: false });
      } else {
        const buffer = await gitClient.getItemContent(
          repoId,
          filePath,
          projectId,
        );
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
    preScaffoldNotes: Array.isArray(obj.preScaffoldNotes)
      ? (obj.preScaffoldNotes as string[])
      : undefined,
    postScaffoldNotes: Array.isArray(obj.postScaffoldNotes)
      ? (obj.postScaffoldNotes as string[])
      : undefined,
    parameters,
    repositories: parseRepositories(obj.repositories),
    pipelines: parsePipelines(obj.pipelines),
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

function parseRepositories(raw: unknown): TemplateRepository[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`repositories[${index}] must be an object`);
    }
    const r = item as Record<string, unknown>;
    if (typeof r.name !== "string")
      throw new Error(`repositories[${index}].name must be a string`);
    if (typeof r.sourcePath !== "string")
      throw new Error(`repositories[${index}].sourcePath must be a string`);

    const repo: TemplateRepository = {
      name: r.name,
      sourcePath: r.sourcePath,
      defaultBranch:
        typeof r.defaultBranch === "string" ? r.defaultBranch : "main",
    };

    if (typeof r.when === "string") repo.when = r.when;

    if (Array.isArray(r.exclude)) {
      repo.exclude = r.exclude
        .filter(
          (e): e is Record<string, unknown> => !!e && typeof e === "object",
        )
        .map(
          (e): TemplateFileExclude => ({
            path: typeof e.path === "string" ? e.path : String(e.path),
            ...(typeof e.when === "string" ? { when: e.when } : {}),
          }),
        );
    }

    return repo;
  });
}

function parsePipelines(raw: unknown): TemplatePipeline[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`pipelines[${index}] must be an object`);
    }
    const p = item as Record<string, unknown>;
    if (typeof p.name !== "string")
      throw new Error(`pipelines[${index}].name must be a string`);
    if (typeof p.repository !== "string")
      throw new Error(`pipelines[${index}].repository must be a string`);
    if (typeof p.yamlPath !== "string")
      throw new Error(`pipelines[${index}].yamlPath must be a string`);

    const pipeline: TemplatePipeline = {
      name: p.name,
      repository: p.repository,
      yamlPath: p.yamlPath,
    };

    if (typeof p.folder === "string") pipeline.folder = p.folder;
    if (typeof p.when === "string") pipeline.when = p.when;

    return pipeline;
  });
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
