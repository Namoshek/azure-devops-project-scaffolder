import * as SDK from "azure-devops-extension-sdk";
import { TemplateRepository } from "../types/templateTypes";
import { fetchTemplateFiles } from "./templateReaderService";
import { renderTemplate } from "./templateEngineService";

export type RepoScaffoldStatus = "created" | "skipped" | "failed";

export interface RepoScaffoldResult {
  repoName: string;
  status: RepoScaffoldStatus;
  reason?: string;
}

/**
 * Creates a repository from a template definition entry.
 *
 * Non-destructive: if the repository already exists and has commits,
 * returns a "skipped" result instead of overwriting it.
 */
export async function scaffoldRepository(
  projectId: string,
  repoTemplate: TemplateRepository,
  sourceProjectId: string,
  sourceRepoId: string,
  parameterValues: Record<string, unknown>,
): Promise<RepoScaffoldResult> {
  const repoName = renderTemplate(repoTemplate.name, parameterValues);

  const accessToken = await SDK.getAccessToken();
  const collection = SDK.getHost().name;
  const baseUrl = `${window.location.origin}/${collection}/${projectId}/_apis/git/repositories`;

  // 1. Check if the repo already exists
  const listResponse = await fetch(`${baseUrl}?api-version=7.1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listResponse.ok) {
    return {
      repoName,
      status: "failed",
      reason: `Failed to list repositories: ${listResponse.statusText}`,
    };
  }

  const listData: { value: Array<{ id: string; name: string; size: number }> } =
    await listResponse.json();

  const existing = listData.value.find(
    (r) => r.name.toLowerCase() === repoName.toLowerCase(),
  );

  if (existing) {
    // Check if non-empty (has at least one ref / commit)
    const refsResponse = await fetch(
      `${baseUrl}/${existing.id}/refs?filter=heads&api-version=7.1`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (refsResponse.ok) {
      const refsData: { count: number } = await refsResponse.json();
      if (refsData.count > 0) {
        return {
          repoName,
          status: "skipped",
          reason: `Repository '${repoName}' already exists and is not empty.`,
        };
      }
    }
  }

  // 2. Create the repository if it doesn't exist
  let repoId: string;

  if (!existing) {
    const createResponse = await fetch(`${baseUrl}?api-version=7.1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name: repoName, project: { id: projectId } }),
    });

    if (!createResponse.ok) {
      const text = await createResponse.text();
      return {
        repoName,
        status: "failed",
        reason: `Failed to create repository: ${text}`,
      };
    }

    const created: { id: string } = await createResponse.json();
    repoId = created.id;
  } else {
    repoId = existing.id;
  }

  // 3. Fetch template files
  let templateFiles: Array<{
    path: string;
    content: string;
    isBase64: boolean;
  }>;
  try {
    templateFiles = await fetchTemplateFiles(
      sourceProjectId,
      sourceRepoId,
      repoTemplate.sourcePath,
    );
  } catch (err) {
    return {
      repoName,
      status: "failed",
      reason: `Failed to read template files: ${(err as Error).message}`,
    };
  }

  if (templateFiles.length === 0) {
    return {
      repoName,
      status: "skipped",
      reason: "Template source path contains no files.",
    };
  }

  // 4. Apply Handlebars to content and path, exclude project-template.yml
  const sourcePathPrefix = repoTemplate.sourcePath.endsWith("/")
    ? repoTemplate.sourcePath
    : `${repoTemplate.sourcePath}/`;

  const changes = templateFiles
    .filter((f) => !f.path.endsWith("project-template.yml"))
    .map((f) => {
      // Strip the sourcePath prefix to get the relative file path for the new repo
      let relativePath = f.path.startsWith(sourcePathPrefix)
        ? f.path.slice(sourcePathPrefix.length)
        : f.path;

      // Apply Handlebars to the path (for dynamic file names)
      relativePath = renderTemplate(relativePath, parameterValues);

      // Apply Handlebars to text content only
      const renderedContent = f.isBase64
        ? f.content
        : renderTemplate(f.content, parameterValues);

      return {
        changeType: 1, // Add
        item: { path: `/${relativePath}` },
        newContent: {
          content: renderedContent,
          contentType: f.isBase64 ? 2 : 0, // 2 = base64Encoded, 0 = rawtext
        },
      };
    });

  // 5. Push all files in a single commit
  const defaultBranch = repoTemplate.defaultBranch || "main";
  const pushPayload = {
    refUpdates: [
      {
        name: `refs/heads/${defaultBranch}`,
        oldObjectId: "0000000000000000000000000000000000000000",
      },
    ],
    commits: [
      {
        comment: "Initial scaffold from template",
        changes,
      },
    ],
  };

  const pushResponse = await fetch(
    `${baseUrl}/${repoId}/pushes?api-version=7.1`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(pushPayload),
    },
  );

  if (!pushResponse.ok) {
    const text = await pushResponse.text();
    return {
      repoName,
      status: "failed",
      reason: `Failed to push files: ${text}`,
    };
  }

  // 6. If a non-default branch was specified, also update HEAD
  if (defaultBranch !== "main") {
    // Optionally update HEAD ref — ADO defaults to the first branch pushed; skip for now
  }

  return { repoName, status: "created" };
}
