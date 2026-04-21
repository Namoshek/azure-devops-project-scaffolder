import { useState, useEffect } from "react";
import { fetchTemplateFiles } from "../../../services/templateReaderService";
import { renderTemplatePreview, evaluateWhenExpression } from "../../../services/templateEngineService";
import { RepositoryPreviewContext } from "../../../utils/summaryBuilder";

export interface ProcessedFile {
  /** Raw absolute path as returned by the Git API (e.g. /templates/backend/README.md). */
  sourcePath: string;
  /** Path relative to sourcePath with Mustache applied (e.g. MyProject.backend/README.md). */
  renderedPath: string;
  /** Mustache-rendered file content for text files; null for binary files. */
  renderedContent: string | null;
  isExcluded: boolean;
  isBase64: boolean;
}

export interface UseRepositoryPreviewResult {
  loading: boolean;
  error: string | null;
  files: ProcessedFile[];
  selectedFile: ProcessedFile | null;
  collapsedFolders: Set<string>;
  setSelectedFile: (file: ProcessedFile) => void;
  toggleFolder: (path: string) => void;
}

/**
 * Handles fetching and state for the repository content preview dialog.
 * Fetches template files when `open` becomes true and processes them into
 * rendered paths/content ready for display.
 */
export function useRepositoryPreview(
  open: boolean,
  previewContext: RepositoryPreviewContext,
): UseRepositoryPreviewResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ProcessedFile | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      return;
    }

    setLoading(true);
    setError(null);
    setFiles([]);
    setSelectedFile(null);

    const { sourceProjectId, sourceRepoId, templateRepository, viewValues } = previewContext;

    // Normalise sourcePath the same way repositoryService.ts does.
    const rawSourcePath = templateRepository.sourcePath ?? "";
    const normalizedBase = rawSourcePath.startsWith("/") ? rawSourcePath : `/${rawSourcePath}`;
    const sourcePathPrefix = normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`;

    void fetchTemplateFiles(sourceProjectId, sourceRepoId, normalizedBase)
      .then((rawFiles) => {
        const processed: ProcessedFile[] = rawFiles
          // Mirror the project-template.yml exclusion done in repositoryService.ts
          .filter((f) => !f.path.endsWith("project-template.yml"))
          .map((f) => {
            // Strip the sourcePath prefix to get the relative file path.
            const relativePath = f.path.startsWith(sourcePathPrefix)
              ? f.path.slice(sourcePathPrefix.length)
              : f.path.startsWith("/")
                ? f.path.slice(1)
                : f.path;

            const renderedPath = renderTemplatePreview(relativePath, viewValues);
            const renderedContent = f.isBase64 ? null : renderTemplatePreview(f.content, viewValues);

            // Evaluate exclude rules using the same matching logic as repositoryService.ts.
            const excludeRules = templateRepository.exclude ?? [];
            const isExcluded = excludeRules.some(
              (rule) =>
                (rule.path.endsWith("/") ? relativePath.startsWith(rule.path) : rule.path === relativePath) &&
                (!rule.when || evaluateWhenExpression(rule.when, viewValues)),
            );

            return { sourcePath: f.path, renderedPath, renderedContent, isExcluded, isBase64: f.isBase64 };
          });

        // Derive all unique folder paths so every folder starts collapsed.
        const allFolderPaths = new Set<string>();
        for (const f of processed) {
          const parts = f.renderedPath.split("/").filter(Boolean);
          for (let i = 1; i < parts.length; i++) {
            allFolderPaths.add(parts.slice(0, i).join("/"));
          }
        }

        const firstIncluded = processed.find((f) => !f.isExcluded) ?? processed[0] ?? null;
        setSelectedFile(firstIncluded);
        setFiles(processed);
        setCollapsedFolders(allFolderPaths);
      })
      .catch((err: unknown) => {
        setError((err as Error).message ?? "Failed to load repository files.");
      })
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleFolder(path: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return { loading, error, files, selectedFile, collapsedFolders, setSelectedFile, toggleFolder };
}
