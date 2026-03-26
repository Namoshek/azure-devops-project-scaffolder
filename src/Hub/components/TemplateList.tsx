import React, { useState, useEffect, useMemo } from "react";
import {
  TemplateDefinition,
  DiscoveredTemplate,
  ALL_CATEGORY_NAME,
  OTHERS_CATEGORY_NAME,
} from "../types/templateTypes";
import { TextField } from "azure-devops-ui/Components/TextField/TextField";
import { discoverTemplates } from "../services/templateDiscoveryService";
import { getTemplateCategories } from "../services/extensionSettingsService";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { ZeroData } from "azure-devops-ui/Components/ZeroData/ZeroData";
import { TemplateCard } from "./TemplateCard";
import { HowItWorksDialog } from "./HowItWorksDialog";
import {
  SingleLayerMasterPanel,
  SingleLayerMasterPanelHeader,
} from "azure-devops-ui/MasterDetails";
import { List, ListItem } from "azure-devops-ui/List";
import { ListSelection } from "azure-devops-ui/List";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";

interface TemplateListProps {
  onTemplateSelected: (template: TemplateDefinition) => void;
}

interface TemplateCategory {
  name: string;
  templates: DiscoveredTemplate[];
  isEmpty: boolean;
}

function groupTemplates(
  templates: DiscoveredTemplate[],
  configuredCategories: string[],
): TemplateCategory[] {
  // Prepend the virtual "All" category that shows every filtered template.
  const result: TemplateCategory[] = [
    {
      name: ALL_CATEGORY_NAME,
      templates,
      isEmpty: templates.length === 0,
    },
  ];

  const grouped: Record<string, DiscoveredTemplate[]> = {};
  for (const category of configuredCategories) {
    grouped[category] = [];
  }

  const others: DiscoveredTemplate[] = [];

  for (const t of templates) {
    const cats = t.definition.templateCategories ?? [];
    let matchedAny = false;
    for (const cat of cats) {
      if (grouped[cat] !== undefined) {
        grouped[cat].push(t);
        matchedAny = true;
      }
    }
    if (!matchedAny) {
      others.push(t);
    }
  }

  for (const name of configuredCategories) {
    result.push({
      name,
      templates: grouped[name],
      isEmpty: grouped[name].length === 0,
    });
  }

  result.push({
    name: OTHERS_CATEGORY_NAME,
    templates: others,
    isEmpty: others.length === 0,
  });

  return result;
}

export function TemplateList({ onTemplateSelected }: TemplateListProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DiscoveredTemplate[]>([]);
  const [configuredCategories, setConfiguredCategories] = useState<string[]>(
    [],
  );
  const [selectedCategory, setSelectedCategory] =
    useState<string>(ALL_CATEGORY_NAME);
  const [searchQuery, setSearchQuery] = useState("");

  // Stable selection object for the ADO List component — must not change between renders.
  const groupSelection = useMemo(
    () => new ListSelection({ selectOnFocus: false }),
    [],
  );

  // Filter templates by name and description based on the search query.
  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.definition.name.toLowerCase().includes(q) ||
        (t.definition.description ?? "").toLowerCase().includes(q),
    );
  }, [templates, searchQuery]);

  // Derive categories from state — placed before early returns to satisfy Rules of Hooks.
  const groups = useMemo(
    () => groupTemplates(filteredTemplates, configuredCategories),
    [filteredTemplates, configuredCategories],
  );

  const groupItemProvider = useMemo(
    () => new ArrayItemProvider(groups),
    [groups],
  );

  useEffect(() => {
    Promise.all([discoverTemplates(), getTemplateCategories()])
      .then(([discovered, cats]) => {
        setTemplates(discovered);
        setConfiguredCategories(cats);
        // Always start on the "All" category (index 0).
        setSelectedCategory(ALL_CATEGORY_NAME);
        groupSelection.select(0);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        setError((err as Error).message);
      });
  }, [groupSelection]);

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

  const activeGroup =
    groups.find((g) => g.name === selectedCategory) ??
    groups[groups.length - 1];

  return (
    <div>
      <div
        className="flex-row flex-wrap"
        style={{ alignItems: "center", gap: 12, margin: "0 0 16px" }}
      >
        <p className="body-l secondary-text" style={{ margin: 0, flex: 1 }}>
          Select a template to scaffold a new project.
        </p>
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
          renderHeader={() => (
            <SingleLayerMasterPanelHeader title="Categories" />
          )}
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
                    <span
                      className="secondary-text"
                      style={{ marginLeft: 6, fontSize: "0.8em" }}
                    >
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
                <TemplateCard
                  key={t.definition.id}
                  template={t}
                  onSelect={() => onTemplateSelected(t.definition)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
