import * as React from "react";
import { TemplateDefinition, DiscoveredTemplate } from "../types/templateTypes";
import { discoverTemplates } from "../services/templateDiscoveryService";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { TitleSize } from "azure-devops-ui/Components/Header/Header.Props";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Pill as PillBase } from "azure-devops-ui/Components/Pill/Pill";
import {
  PillSize,
  PillVariant,
} from "azure-devops-ui/Components/Pill/Pill.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
const Pill = PillBase as React.ComponentType<
  React.ComponentProps<typeof PillBase> & { children?: React.ReactNode }
>;
import { ZeroData } from "azure-devops-ui/Components/ZeroData/ZeroData";

interface TemplateListProps {
  isAdmin: boolean;
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
      return (
        <Spinner size={SpinnerSize.large} label="Discovering templates…" />
      );
    }

    if (error) {
      return (
        <MessageCard severity={MessageCardSeverity.Error}>
          <strong>Template discovery failed</strong>
          <p style={{ margin: "8px 0 0" }}>{error}</p>
        </MessageCard>
      );
    }

    if (templates.length === 0) {
      return (
        <ZeroData
          primaryText="No templates found"
          secondaryText={
            <>
              Create a repository in any project in this collection with a{" "}
              <code>project-template.yml</code> file at the root to get started.
            </>
          }
          imageAltText="No templates found"
          iconProps={{ iconName: "FileTemplate" }}
        />
      );
    }

    return (
      <div>
        <p className="body-m secondary-text" style={{ margin: "0 0 20px" }}>
          Select a template to scaffold a new project.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
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
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      role="button"
      tabIndex={0}
      className="cursor-pointer"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      <Card
        titleProps={{ text: definition.name, size: TitleSize.Medium }}
        headerDescriptionProps={{ text: `v${definition.version}` }}
      >
        <div
          className="flex-column rhythm-vertical-8"
          style={{ paddingBottom: 4 }}
        >
          {definition.description && (
            <p className="body-m" style={{ margin: 0 }}>
              {definition.description}
            </p>
          )}
          <p className="secondary-text caption" style={{ margin: 0 }}>
            {sourceProjectName} / {sourceRepoName}
            {definition.maintainers && definition.maintainers.length > 0 && (
              <span style={{ marginLeft: 12 }}>
                Maintained by: {definition.maintainers.join(", ")}
              </span>
            )}
          </p>
          {((definition.repositories && definition.repositories.length > 0) ||
            (definition.pipelines && definition.pipelines.length > 0)) && (
            <div className="flex-row flex-wrap rhythm-horizontal-8">
              {definition.repositories &&
                definition.repositories.length > 0 && (
                  <Pill size={PillSize.compact} variant={PillVariant.outlined}>
                    {definition.repositories.length} repo(s)
                  </Pill>
                )}
              {definition.pipelines && definition.pipelines.length > 0 && (
                <Pill size={PillSize.compact} variant={PillVariant.outlined}>
                  {definition.pipelines.length} pipeline(s)
                </Pill>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
