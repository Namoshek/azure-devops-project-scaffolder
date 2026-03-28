import { getClient } from "azure-devops-extension-api";
import { GitRestClient, GitPush, VersionControlChangeType, ItemContentType } from "azure-devops-extension-api/Git";
import { TemplateRepository } from "../types/templateTypes";
import { fetchTemplateFiles } from "./templateReaderService";
import { renderTemplate, evaluateWhenExpression } from "./templateEngineService";
import { checkRepoExists } from "./preflightCheckService";

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
  const gitClient = getClient(GitRestClient);

  // 1. Check if the repo already exists (fresh=true bypasses preview cache)
  let existenceCheck: Awaited<ReturnType<typeof checkRepoExists>>;
  try {
    existenceCheck = await checkRepoExists(projectId, repoName, {
      fresh: true,
    });
  } catch (err) {
    return {
      repoName,
      status: "failed",
      reason: `Failed to check repository existence: ${(err as Error).message}`,
    };
  }

  if (existenceCheck.exists && existenceCheck.isNonEmpty) {
    return {
      repoName,
      status: "skipped",
      reason: `Repository '${repoName}' already exists and is not empty.`,
    };
  }

  // 2. Create the repository if it doesn't exist
  let repoId: string;

  if (!existenceCheck.exists) {
    let created: Awaited<ReturnType<GitRestClient["createRepository"]>>;
    try {
      created = await gitClient.createRepository(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { name: repoName, project: { id: projectId } } as any,
        projectId,
      );
    } catch (err) {
      return {
        repoName,
        status: "failed",
        reason: `Failed to create repository: ${(err as Error).message}`,
      };
    }
    repoId = created.id!;
  } else {
    // Repo exists but is empty — look up its ID to push the initial commit.
    try {
      const repos = await gitClient.getRepositories(projectId);
      const found = repos.find((r) => r.name?.toLowerCase() === repoName.toLowerCase());
      if (!found?.id) {
        return {
          repoName,
          status: "failed",
          reason: `Repository '${repoName}' found during existence check but could not be located again.`,
        };
      }
      repoId = found.id;
    } catch (err) {
      return {
        repoName,
        status: "failed",
        reason: `Failed to resolve existing repository ID: ${(err as Error).message}`,
      };
    }
  }

  // 3. Fetch template files
  let templateFiles: Array<{
    path: string;
    content: string;
    isBase64: boolean;
  }>;
  try {
    templateFiles = await fetchTemplateFiles(sourceProjectId, sourceRepoId, repoTemplate.sourcePath);
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
  // Normalise to an absolute prefix (Git API returns paths like /templates/backend/file.txt)
  const normalizedBase = repoTemplate.sourcePath.startsWith("/")
    ? repoTemplate.sourcePath
    : `/${repoTemplate.sourcePath}`;
  const sourcePathPrefix = normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`;

  const changes = templateFiles
    .filter((f) => !f.path.endsWith("project-template.yml"))
    .filter((f) => {
      // Apply exclude rules: drop any file whose relative path matches a rule
      // whose when expression evaluates to true (meaning: exclude condition is met)
      const relativePath = f.path.startsWith(sourcePathPrefix) ? f.path.slice(sourcePathPrefix.length) : f.path;
      return !(repoTemplate.exclude ?? []).some(
        (rule) => rule.path === relativePath && (!rule.when || evaluateWhenExpression(rule.when, parameterValues)),
      );
    })
    .map((f) => {
      // Strip the sourcePath prefix to get the relative file path for the new repo
      let relativePath = f.path.startsWith(sourcePathPrefix) ? f.path.slice(sourcePathPrefix.length) : f.path;

      // Apply Handlebars to the path (for dynamic file names)
      relativePath = renderTemplate(relativePath, parameterValues);

      // Apply Handlebars to text content only
      const renderedContent = f.isBase64 ? f.content : renderTemplate(f.content, parameterValues);

      return {
        changeType: VersionControlChangeType.Add,
        item: { path: `/${relativePath}` },
        newContent: {
          content: renderedContent,
          contentType: f.isBase64 ? ItemContentType.Base64Encoded : ItemContentType.RawText,
        },
      };
    });

  // 5. Push all files in a single commit
  const defaultBranch = repoTemplate.defaultBranch || "main";

  try {
    await gitClient.createPush(
      {
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
      } as GitPush,
      repoId,
      projectId,
    );
  } catch (err) {
    return {
      repoName,
      status: "failed",
      reason: `Failed to push files: ${(err as Error).message}`,
    };
  }

  return { repoName, status: "created" };
}
