import React from "react";
import { TemplateDefinition } from "../../../../types/templateTypes";
import { TextField } from "azure-devops-ui/Components/TextField/TextField";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { ZeroData } from "azure-devops-ui/Components/ZeroData/ZeroData";
import { TemplateCard } from "./TemplateCard";
import { HowItWorksDialog } from "../dialogs/HowItWorksDialog";
import { ScaffoldingHistoryDialog } from "../dialogs/ScaffoldingHistoryDialog";
import { SingleLayerMasterPanel, SingleLayerMasterPanelHeader } from "azure-devops-ui/MasterDetails";
import { List, ListItem } from "azure-devops-ui/List";
import { TemplateCategory } from "../../../../utils/templateGrouping";
import { useTemplateData } from "../../hooks/useTemplateData";

interface TemplateListProps {
  onTemplateSelected: (template: TemplateDefinition) => void;
}

export function TemplateList({ onTemplateSelected }: TemplateListProps) {
  const {
    loading,
    error,
    templates,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    groups,
    groupItemProvider,
    groupSelection,
  } = useTemplateData();

  if (loading) {
    return <Spinner size={SpinnerSize.large} label="Discovering templates…" />;
  }

  if (error) {
    return (
      <MessageCard severity={MessageCardSeverity.Error}>
        <strong>Template discovery failed</strong>
        <p style={{ paddingLeft: 8 }}>{error}</p>
      </MessageCard>
    );
  }

  if (templates.length === 0) {
    return (
      <ZeroData
        primaryText="No templates found"
        secondaryText={
          <>
            Create a repository in any project in this collection with a <code>project-template.yml</code> file at the
            root to get started.
          </>
        }
        imageAltText="No templates found"
        iconProps={{ iconName: "FileTemplate" }}
      />
    );
  }

  const activeGroup = groups.find((g) => g.name === selectedCategory) ?? groups[groups.length - 1];

  return (
    <div>
      <div className="flex-row flex-wrap" style={{ alignItems: "center", gap: 12, margin: "0 0 16px" }}>
        <p className="body-l secondary-text" style={{ margin: 0, flex: 1 }}>
          Select a template to scaffold a new project.
        </p>
        <ScaffoldingHistoryDialog />
        <HowItWorksDialog />
      </div>

      <div style={{ margin: "0 0 16px", maxWidth: 480 }}>
        <TextField
          value={searchQuery}
          onChange={(_e, val) => setSearchQuery(val)}
          placeholder="Search templates by name or description…"
          prefixIconProps={{ iconName: "Search" }}
        />
      </div>

      <div className="flex-row" style={{ alignItems: "flex-start" }}>
        <SingleLayerMasterPanel
          showOnSmallScreens
          renderHeader={() => <SingleLayerMasterPanelHeader title="Categories" />}
          renderContent={() => (
            <List<TemplateCategory>
              itemProvider={groupItemProvider}
              renderRow={(rowIndex, item, details) => (
                <ListItem index={rowIndex} details={details}>
                  <div
                    className="bolt-list-cell"
                    style={{
                      padding: "8px 16px",
                      opacity: item.isEmpty ? 0.5 : 1,
                    }}
                  >
                    <span className="body-m">{item.name}</span>
                    <span className="secondary-text" style={{ marginLeft: 6, fontSize: "0.8em" }}>
                      ({item.templates.length})
                    </span>
                  </div>
                </ListItem>
              )}
              selection={groupSelection}
              onSelect={(_evt, row) => setSelectedCategory(row.data.name)}
              singleClickActivation
              virtualize={false}
              width="100%"
            />
          )}
        />

        <div style={{ flex: 1, minWidth: 0, padding: "0 0 0 24px" }}>
          {activeGroup.isEmpty ? (
            <ZeroData
              primaryText={`No templates in "${activeGroup.name}"`}
              secondaryText="No templates have been assigned to this category yet."
              imageAltText="No templates in this category"
              iconProps={{ iconName: "FileTemplate" }}
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(500px, 1fr))",
                gap: 16,
              }}
            >
              {activeGroup.templates.map((t) => (
                <TemplateCard key={t.definition.id} template={t} onSelect={() => onTemplateSelected(t.definition)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
