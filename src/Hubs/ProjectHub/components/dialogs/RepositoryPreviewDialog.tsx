import React, { useMemo } from "react";
import { Dialog as DialogBase } from "azure-devops-ui/Components/Dialog/Dialog";
import { ContentSize } from "azure-devops-ui/Callout";
import { TitleSize } from "azure-devops-ui/Header";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { Icon, IconSize } from "azure-devops-ui/Icon";
import { RepositoryPreviewContext } from "../../../../utils/summaryBuilder";
import { ProcessedFile, useRepositoryPreview } from "../../hooks/useRepositoryPreview";

const Dialog = DialogBase as React.ComponentType<
  React.ComponentProps<typeof DialogBase> & { children?: React.ReactNode }
>;

// ─── Tree types ────────────────────────────────────────────────────────────────

interface TreeFolderNode {
  name: string;
  /** Slash-joined path from the tree root, used as the collapse key. */
  fullPath: string;
  isFolder: true;
  children: AnyNode[];
}

interface TreeFileNode {
  name: string;
  isFolder: false;
  file: ProcessedFile;
}

type AnyNode = TreeFolderNode | TreeFileNode;

// ─── Tree builder ──────────────────────────────────────────────────────────────

function buildFileTree(files: ProcessedFile[]): AnyNode[] {
  const rootChildren: AnyNode[] = [];
  const folderMap = new Map<string, TreeFolderNode>();

  function ensureFolder(pathParts: string[]): TreeFolderNode {
    const key = pathParts.join("/");
    const existing = folderMap.get(key);

    if (existing) {
      return existing;
    }

    const node: TreeFolderNode = {
      name: pathParts[pathParts.length - 1],
      fullPath: key,
      isFolder: true,
      children: [],
    };

    folderMap.set(key, node);

    if (pathParts.length === 1) {
      rootChildren.push(node);
    } else {
      ensureFolder(pathParts.slice(0, -1)).children.push(node);
    }

    return node;
  }

  for (const file of files) {
    const parts = file.renderedPath.split("/").filter(Boolean);

    if (parts.length <= 1) {
      rootChildren.push({ name: parts[0] ?? file.renderedPath, isFolder: false, file });
    } else {
      ensureFolder(parts.slice(0, -1)).children.push({
        name: parts[parts.length - 1],
        isFolder: false,
        file,
      });
    }
  }

  // Recursively sort each level: folders before files, then alphabetically within each group.
  function sortNodes(nodes: AnyNode[]): void {
    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) {
        return a.isFolder ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    for (const node of nodes) {
      if (node.isFolder) {
        sortNodes(node.children);
      }
    }
  }

  sortNodes(rootChildren);

  return rootChildren;
}

// ─── Tree sub-components ──────────────────────────────────────────────────────────────

const ROW_BASE_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  paddingTop: 3,
  paddingBottom: 3,
  paddingRight: 12,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 12,
  fontFamily: "inherit",
  width: "100%",
  flexShrink: 0,
};

interface FolderTreeRowProps {
  node: TreeFolderNode;
  depth: number;
  isCollapsed: boolean;
  onToggle: () => void;
}

function FolderTreeRow({ node, depth, isCollapsed, onToggle }: FolderTreeRowProps) {
  return (
    <button
      title={node.name}
      aria-label={`${isCollapsed ? "Expand" : "Collapse"} folder ${node.name}`}
      onClick={onToggle}
      style={{ ...ROW_BASE_STYLE, paddingLeft: 8 + depth * 16 }}>
      <span style={{ flexShrink: 0, lineHeight: 0 }}>
        <Icon iconName={isCollapsed ? "ChevronRight" : "ChevronDown"} size={IconSize.small} />
      </span>
      <span style={{ flexShrink: 0, lineHeight: 0 }}>
        <Icon iconName="FolderHorizontal" size={IconSize.small} />
      </span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
        {node.name}
      </span>
    </button>
  );
}

interface FileTreeRowProps {
  node: TreeFileNode;
  depth: number;
  isSelected: boolean;
  onSelect: () => void;
}

function FileTreeRow({ node, depth, isSelected, onSelect }: FileTreeRowProps) {
  const { file } = node;
  return (
    <button
      title={file.renderedPath}
      onClick={onSelect}
      style={{
        ...ROW_BASE_STYLE,
        paddingLeft: 8 + depth * 16,
        background: isSelected ? "var(--palette-black-alpha-6, #f0f0f0)" : "transparent",
        opacity: file.isExcluded ? 0.5 : 1,
      }}
    >
      {/* Fixed-width spacer keeps file icon aligned with folder name column */}
      <span style={{ flexShrink: 0, display: "inline-block", width: 16 }} />
      <span
        style={{
          flexShrink: 0,
          lineHeight: 0,
          color: file.isExcluded
            ? "var(--status-warning-foreground, #b8860b)"
            : "var(--status-success-foreground, #107c10)",
        }}
      >
        <Icon iconName="Page" size={IconSize.small} />
      </span>
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: file.isExcluded ? "line-through" : undefined,
        }}
      >
        {node.name}
      </span>
      {file.isExcluded && (
        <span
          style={{
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--status-warning-foreground, #b8860b)",
          }}
        >
          Excluded
        </span>
      )}
    </button>
  );
}

interface TreeLevelProps {
  nodes: AnyNode[];
  depth: number;
  collapsedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  selectedFile: ProcessedFile | null;
  onSelectFile: (file: ProcessedFile) => void;
}

function TreeLevel({ nodes, depth, collapsedFolders, onToggleFolder, selectedFile, onSelectFile }: TreeLevelProps) {
  return (
    <>
      {nodes.map((node) =>
        node.isFolder ? (
          <React.Fragment key={`folder::${node.fullPath}`}>
            <FolderTreeRow
              node={node}
              depth={depth}
              isCollapsed={collapsedFolders.has(node.fullPath)}
              onToggle={() => onToggleFolder(node.fullPath)}
            />
            {!collapsedFolders.has(node.fullPath) && (
              <TreeLevel
                nodes={node.children}
                depth={depth + 1}
                collapsedFolders={collapsedFolders}
                onToggleFolder={onToggleFolder}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
              />
            )}
          </React.Fragment>
        ) : (
          <FileTreeRow
            key={`file::${node.file.renderedPath}`}
            node={node}
            depth={depth}
            isSelected={selectedFile === node.file}
            onSelect={() => onSelectFile(node.file)}
          />
        ),
      )}
    </>
  );
}

interface ContentPaneProps {
  selectedFile: ProcessedFile | null;
  contentLoading: boolean;
  contentError: string | null;
}

function ContentPane({ selectedFile, contentLoading, contentError }: ContentPaneProps) {
  if (selectedFile === null) {
    return <span className="body-s secondary-text">Select a file to preview its contents.</span>;
  }
  if (selectedFile.isBase64) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon iconName="FileImage" size={IconSize.small} />
        <span className="body-s secondary-text">Binary file â€” cannot preview contents.</span>
      </div>
    );
  }
  if (contentLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Spinner size={SpinnerSize.small} />
        <span className="body-s secondary-text">Loading file contents…</span>
      </div>
    );
  }
  if (contentError) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon iconName="StatusErrorFull" size={IconSize.small} />
        <span className="body-s" style={{ color: "var(--status-error-foreground, #cc0000)" }}>
          Failed to load: {contentError}
        </span>
      </div>
    );
  }
  return (
    <pre
      style={{
        margin: 0,
        fontSize: 12,
        lineHeight: 1.6,
        fontFamily: "Consolas, 'Courier New', monospace",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {selectedFile.renderedContent}
    </pre>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface RepositoryPreviewDialogProps {
  open: boolean;
  onDismiss: () => void;
  repoName: string;
  previewContext: RepositoryPreviewContext;
}

export function RepositoryPreviewDialog({ open, onDismiss, repoName, previewContext }: RepositoryPreviewDialogProps) {
  const {
    loading,
    error,
    files,
    selectedFile,
    collapsedFolders,
    contentLoading,
    contentError,
    setSelectedFile,
    toggleFolder,
  } = useRepositoryPreview(open, previewContext);

  const fileTree = useMemo(() => buildFileTree(files), [files]);

  if (!open) {
    return null;
  }

  return (
    <Dialog
      titleProps={{ text: `Preview: ${repoName}`, size: TitleSize.Large }}
      showCloseButton
      onDismiss={onDismiss}
      contentSize={ContentSize.Auto}
    >
      <div style={{ display: "flex", minHeight: 460, maxHeight: 560, overflow: "hidden" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 24 }}>
            <Spinner size={SpinnerSize.small} />
            <span className="body-s secondary-text">Loading repository contentsâ€¦</span>
          </div>
        )}

        {!loading && error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 24 }}>
            <Icon iconName="StatusErrorFull" size={IconSize.small} />
            <span className="body-s" style={{ color: "var(--status-error-foreground, #cc0000)" }}>
              Failed to load: {error}
            </span>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* File tree */}
            <div
              style={{
                width: 300,
                flexShrink: 0,
                borderRight: "1px solid var(--palette-black-alpha-10, #e0e0e0)",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                paddingTop: 4,
                paddingBottom: 4,
              }}
            >
              {files.length === 0 ? (
                <span className="body-s secondary-text" style={{ padding: "12px 16px" }}>
                  No files found in source path.
                </span>
              ) : (
                <TreeLevel
                  nodes={fileTree}
                  depth={0}
                  collapsedFolders={collapsedFolders}
                  onToggleFolder={toggleFolder}
                  selectedFile={selectedFile}
                  onSelectFile={setSelectedFile}
                />
              )}
            </div>

            {/* Content pane */}
            <div style={{ flex: 1, overflow: "auto", padding: "12px 16px", minWidth: 600 }}>
              <ContentPane selectedFile={selectedFile} contentLoading={contentLoading} contentError={contentError} />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
