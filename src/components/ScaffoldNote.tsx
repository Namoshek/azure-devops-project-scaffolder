import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { renderTemplatePreview } from "../services/templateEngineService";

interface ScaffoldNoteProps {
  note: string;
  values: Record<string, unknown>;
}

// ADO UI uses horizontal-only separators driven by CSS custom properties.
// Replicating the same tokens with light-mode fallbacks makes the table respect
// light, dark, and high-contrast themes automatically.
const CELL_BORDER = "1px solid var(--component-grid-cell-bottom-border-color, rgba(234, 234, 234, 1))";

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  table: ({ children, ...props }) => (
    <table {...props} style={{ borderCollapse: "collapse", width: "100%", marginTop: 8, marginBottom: 4 }}>
      {children}
    </table>
  ),
  th: ({ children, ...props }) => (
    <th
      {...props}
      style={{
        borderBottom: CELL_BORDER,
        padding: "0.375rem 0.6875rem",
        textAlign: "left",
        fontWeight: 600,
        color: "var(--text-secondary-color, rgba(0, 0, 0, 0.55))",
      }}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      {...props}
      style={{
        borderBottom: CELL_BORDER,
        padding: "0.5625rem 0.75rem",
        color: "var(--text-primary-color, rgba(0, 0, 0, 0.9))",
      }}
    >
      {children}
    </td>
  ),
};

/**
 * Renders a single scaffold note (from preScaffoldNotes or postScaffoldNotes) inside a
 * MessageCard. The note string is first interpolated through Mustache so that {{paramId}}
 * tokens reflect the user's current form values, then rendered as GitHub-flavored Markdown.
 *
 * Backwards compatible: plain-text notes continue to display correctly. Single newlines in
 * multi-line notes produce visible line breaks (via remark-breaks), matching legacy behavior.
 *
 * Raw HTML inside note strings is intentionally stripped — only Markdown syntax is rendered.
 */
export function ScaffoldNote({ note, values }: ScaffoldNoteProps) {
  const rendered = renderTemplatePreview(note, values);
  return (
    <MessageCard severity={MessageCardSeverity.Info}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
        {rendered}
      </ReactMarkdown>
    </MessageCard>
  );
}
