import { useState, useEffect, useRef } from "react";
import { getClient } from "azure-devops-extension-api";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { fetchTemplateFileList } from "../../../services/templateReaderService";
import { renderTemplatePreview, evaluateWhenExpression } from "../../../services/templateEngineService";
import { RepositoryPreviewContext } from "../../../utils/summaryBuilder";
import { getErrorMessage } from "../../../utils/errorUtils";

export interface ProcessedFile {
  /** Raw absolute path as returned by the Git API (e.g. /templates/backend/README.md). */
  sourcePath: string;
  /** Path relative to sourcePath with Mustache applied (e.g. MyProject.backend/README.md). */
  renderedPath: string;
  /** Mustache-rendered file content for text files; null when not yet loaded or binary. */
  renderedContent: string | null;
  isExcluded: boolean;
  isBase64: boolean;
  /** True once content has been fetched (always true for binary files, which need no fetch). */
  contentLoaded: boolean;
}

export interface UseRepositoryPreviewResult {
  loading: boolean;
  error: string | null;
  files: ProcessedFile[];
  selectedFile: ProcessedFile | null;
  collapsedFolders: Set<string>;
  /** True while the selected file's content is being fetched on demand. */
  contentLoading: boolean;
  /** Error message if the selected file's content failed to load. */
  contentError: string | null;
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
  const [selectedFile, setSelectedFileState] = useState<ProcessedFile | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Keep a ref so the content-loading effect always sees the latest context
  // values even though the file-list effect only re-runs when `open` changes.
  const previewContextRef = useRef(previewContext);
  useEffect(() => {
    previewContextRef.current = previewContext;
  });

  // ── Phase 1: fetch the file list as soon as the dialog opens ────────────────
  useEffect(() => {
    if (!open) {
      return;
    }

    setLoading(true);
    setError(null);
    setFiles([]);
    setSelectedFileState(null);
    setContentLoading(false);
    setContentError(null);

    const { sourceProjectId, sourceRepoId, templateRepository, viewValues } = previewContext;

    // Normalise sourcePath the same way repositoryService.ts does.
    const rawSourcePath = templateRepository.sourcePath ?? "";
    const normalizedBase = rawSourcePath.startsWith("/") ? rawSourcePath : `/${rawSourcePath}`;
    const sourcePathPrefix = normalizedBase.endsWith("/") ? normalizedBase : `${normalizedBase}/`;

    void fetchTemplateFileList(sourceProjectId, sourceRepoId, normalizedBase)
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

            // Evaluate exclude rules using the same matching logic as repositoryService.ts.
            const excludeRules = templateRepository.exclude ?? [];
            const isExcluded = excludeRules.some(
              (rule) =>
                (rule.path.endsWith("/") ? relativePath.startsWith(rule.path) : rule.path === relativePath) &&
                (!rule.when || evaluateWhenExpression(rule.when, viewValues)),
            );

            // Binary files don't need a content fetch; mark them loaded immediately.
            const isBase64 = !f.isText;
            return {
              sourcePath: f.path,
              renderedPath,
              renderedContent: null,
              isExcluded,
              isBase64,
              contentLoaded: isBase64,
            };
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
        setSelectedFileState(firstIncluded);
        setFiles(processed);
        setCollapsedFolders(allFolderPaths);
      })
      .catch((err: unknown) => {
        setError(getErrorMessage(err));
      })
      .finally(() => setLoading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 2: fetch content on demand when a text file is selected ────────────
  useEffect(() => {
    if (!selectedFile || selectedFile.contentLoaded) {
      return;
    }

    let cancelled = false;
    setContentError(null);

    // Only show the spinner if the fetch takes longer than this threshold so
    // fast loads (<300 ms) don't cause a visible flicker.
    const SPINNER_DELAY_MS = 300;
    const spinnerTimer = setTimeout(() => {
      if (cancelled) {
        return;
      }
      setContentLoading(true);
    }, SPINNER_DELAY_MS);

    const { sourceProjectId, sourceRepoId, viewValues } = previewContextRef.current;
    const gitClient = getClient(GitRestClient);

    void gitClient
      .getItemText(sourceRepoId, selectedFile.sourcePath, sourceProjectId)
      .then((rawContent: string) => {
        const renderedContent = renderTemplatePreview(rawContent, viewValues);
        const loadedFile: ProcessedFile = { ...selectedFile, renderedContent, contentLoaded: true };
        // Cache content in files array even if the user has already switched away.
        setFiles((prev) => prev.map((f) => (f.sourcePath === selectedFile.sourcePath ? loadedFile : f)));
        if (cancelled) return;
        setSelectedFileState((prev) => (prev?.sourcePath === selectedFile.sourcePath ? loadedFile : prev));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setContentError(getErrorMessage(err));
      })
      .finally(() => {
        clearTimeout(spinnerTimer);
        if (!cancelled) setContentLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(spinnerTimer);
    };
  }, [selectedFile]);

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

  return {
    loading,
    error,
    files,
    selectedFile,
    collapsedFolders,
    contentLoading,
    contentError,
    setSelectedFile: setSelectedFileState,
    toggleFolder,
  };
}
