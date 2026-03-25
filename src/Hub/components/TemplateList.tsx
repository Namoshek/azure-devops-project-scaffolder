import React, { useState, useEffect } from "react";
import { TemplateDefinition, DiscoveredTemplate } from "../types/templateTypes";
import { discoverTemplates } from "../services/templateDiscoveryService";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { ZeroData } from "azure-devops-ui/Components/ZeroData/ZeroData";
import { TemplateCard } from "./TemplateCard";
import { HowItWorksDialog } from "./HowItWorksDialog";

interface TemplateListProps {
  isAdmin: boolean;
  onTemplateSelected: (template: TemplateDefinition) => void;
}

export function TemplateList({
  isAdmin,
  onTemplateSelected,
}: TemplateListProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DiscoveredTemplate[]>([]);

  useEffect(() => {
    discoverTemplates()
      .then((result) => {
        setLoading(false);
        setTemplates(result);
      })
      .catch((err) => {
        setLoading(false);
        setError((err as Error).message);
      });
  }, []);

  if (loading) {
    return <Spinner size={SpinnerSize.large} label="Discovering templates…" />;
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
      <div
        className="flex-row flex-wrap"
        style={{ alignItems: "center", gap: 12, margin: "0 0 20px" }}
      >
        <p className="body-l secondary-text" style={{ margin: 0, flex: 1 }}>
          {isAdmin && <>Select a template to scaffold a new project.</>}
          {!isAdmin && (
            <>
              These are the available templates. If you need to scaffold a new
              project, contact your project admin.
            </>
          )}
        </p>
        <HowItWorksDialog />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(600px, 1fr))",
          gap: 16,
        }}
      >
        {templates.map((t) => (
          <TemplateCard
            key={t.definition.id}
            template={t}
            onSelect={
              isAdmin ? () => onTemplateSelected(t.definition) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
