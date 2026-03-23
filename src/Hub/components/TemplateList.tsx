import * as React from "react";
import { TemplateDefinition, DiscoveredTemplate } from "../types/templateTypes";
import { discoverTemplates } from "../services/templateDiscoveryService";

interface TemplateListProps {
  onTemplateSelected: (template: TemplateDefinition) => void;
}

interface TemplateListState {
  loading: boolean;
  error: string | null;
  templates: DiscoveredTemplate[];
}

export class TemplateList extends React.Component<
  TemplateListProps,
  TemplateListState
> {
  constructor(props: TemplateListProps) {
    super(props);
    this.state = { loading: true, error: null, templates: [] };
  }

  async componentDidMount() {
    try {
      const templates = await discoverTemplates();
      this.setState({ loading: false, templates });
    } catch (err) {
      this.setState({ loading: false, error: (err as Error).message });
    }
  }

  render() {
    const { loading, error, templates } = this.state;

    if (loading) {
      return <div style={styles.message}>Discovering templates…</div>;
    }

    if (error) {
      return (
        <div style={styles.errorBox}>
          <strong>Template discovery failed</strong>
          <p style={{ margin: "8px 0 0" }}>{error}</p>
        </div>
      );
    }

    if (templates.length === 0) {
      return (
        <div style={styles.message}>
          No templates found. Create a repository in any project in this
          collection with a <code>project-template.yml</code> file at the root
          to get started.
        </div>
      );
    }

    return (
      <div>
        <p style={{ margin: "0 0 20px", color: "#605e5c" }}>
          Select a template to scaffold a new project.
        </p>
        <div style={styles.grid}>
          {templates.map((t) => (
            <TemplateCard
              key={t.definition.id}
              template={t}
              onSelect={() => this.props.onTemplateSelected(t.definition)}
            />
          ))}
        </div>
      </div>
    );
  }
}

// ─── TemplateCard ──────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: DiscoveredTemplate;
  onSelect: () => void;
}

function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const { definition, sourceProjectName, sourceRepoName } = template;

  return (
    <button
      style={styles.card}
      onClick={onSelect}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.borderColor = "#0078d4")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.borderColor = "#c8c6c4")
      }
    >
      <div style={styles.cardTitle}>{definition.name}</div>
      <div style={styles.cardVersion}>v{definition.version}</div>
      {definition.description && (
        <div style={styles.cardDescription}>{definition.description}</div>
      )}
      <div style={styles.cardMeta}>
        <span>
          {sourceProjectName} / {sourceRepoName}
        </span>
        {definition.maintainers && definition.maintainers.length > 0 && (
          <span style={{ marginLeft: 12 }}>
            Maintained by: {definition.maintainers.join(", ")}
          </span>
        )}
      </div>
      {definition.repositories && definition.repositories.length > 0 && (
        <div style={styles.chipRow}>
          <Chip label={`${definition.repositories.length} repo(s)`} />
          {definition.pipelines && definition.pipelines.length > 0 && (
            <Chip label={`${definition.pipelines.length} pipeline(s)`} />
          )}
        </div>
      )}
    </button>
  );
}

function Chip({ label }: { label: string }) {
  return <span style={styles.chip}>{label}</span>;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  message: {
    color: "#605e5c",
    padding: "16px 0",
  },
  errorBox: {
    background: "#fde7e9",
    border: "1px solid #a4262c",
    borderRadius: 4,
    padding: 16,
    color: "#a4262c",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 16,
  },
  card: {
    display: "block",
    textAlign: "left",
    background: "#ffffff",
    border: "1px solid #c8c6c4",
    borderRadius: 4,
    padding: 20,
    cursor: "pointer",
    transition: "border-color 0.1s",
    width: "100%",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#323130",
    marginBottom: 2,
  },
  cardVersion: {
    fontSize: 12,
    color: "#605e5c",
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: "#323130",
    marginBottom: 12,
    lineHeight: 1.5,
  },
  cardMeta: {
    fontSize: 12,
    color: "#605e5c",
    marginBottom: 8,
  },
  chipRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 8,
  },
  chip: {
    background: "#f3f2f1",
    border: "1px solid #c8c6c4",
    borderRadius: 12,
    padding: "2px 10px",
    fontSize: 11,
    color: "#323130",
  },
};
