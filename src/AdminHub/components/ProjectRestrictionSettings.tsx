import React, { useState, useEffect, useMemo } from "react";
import { getClient } from "azure-devops-extension-api";
import { CoreRestClient } from "azure-devops-extension-api/Core";
import { TeamProjectReference } from "azure-devops-extension-api/Core/Core";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { Dropdown } from "azure-devops-ui/Components/Dropdown/Dropdown";
import { FormItem as FormItemBase } from "azure-devops-ui/Components/FormItem/FormItem";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { IListBoxItem } from "azure-devops-ui/Components/ListBox/ListBox.Props";
import { DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import {
  getRestrictedProject,
  setRestrictedProject,
  clearRestrictedProject,
  RestrictedProject,
} from "../../Hub/services/extensionSettingsService";

const FormItem = FormItemBase as React.ComponentType<
  React.ComponentProps<typeof FormItemBase> & { children?: React.ReactNode }
>;

const NO_RESTRICTION_ID = "__none__";

export function ProjectRestrictionSettings() {
  const [loadingState, setLoadingState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [projects, setProjects] = useState<TeamProjectReference[]>([]);
  const [currentRestriction, setCurrentRestriction] =
    useState<RestrictedProject | null>(null);
  const [selectedProjectId, setSelectedProjectId] =
    useState<string>(NO_RESTRICTION_ID);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    severity: MessageCardSeverity;
    text: string;
  } | null>(null);

  const dropdownSelection = useMemo(() => new DropdownSelection(), []);

  useEffect(() => {
    async function load() {
      try {
        const [allProjects, restriction] = await Promise.all([
          getClient(CoreRestClient).getProjects(),
          getRestrictedProject(),
        ]);

        const sorted = [...allProjects].sort((a, b) =>
          a.name.localeCompare(b.name),
        );

        setProjects(sorted);
        setCurrentRestriction(restriction);

        const initialId = restriction?.id ?? NO_RESTRICTION_ID;
        setSelectedProjectId(initialId);

        // Pre-select the correct dropdown item.
        const items = buildItems(sorted);
        const idx = items.findIndex((item) => item.id === initialId);
        if (idx >= 0) {
          dropdownSelection.select(idx);
        }

        setLoadingState("ready");
      } catch (err) {
        setLoadingState("error");
        setFeedback({
          severity: MessageCardSeverity.Error,
          text: `Failed to load settings: ${(err as Error).message}`,
        });
      }
    }
    void load();
  }, [dropdownSelection]);

  function buildItems(projectList: TeamProjectReference[]): IListBoxItem[] {
    return [
      { id: NO_RESTRICTION_ID, text: "No restriction (entire collection)" },
      ...projectList.map((p) => ({ id: p.id!, text: p.name })),
    ];
  }

  const dropdownItems = useMemo(() => buildItems(projects), [projects]);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      if (selectedProjectId === NO_RESTRICTION_ID) {
        await clearRestrictedProject();
        setCurrentRestriction(null);
        setFeedback({
          severity: MessageCardSeverity.Info,
          text: "Restriction cleared. Template discovery will now search the entire collection.",
        });
      } else {
        const project = projects.find((p) => p.id === selectedProjectId);
        if (!project) {
          throw new Error("Selected project not found.");
        }
        await setRestrictedProject(project.id!, project.name);
        setCurrentRestriction({ id: project.id!, name: project.name });
        setFeedback({
          severity: MessageCardSeverity.Info,
          text: `Template discovery restricted to project "${project.name}".`,
        });
      }
    } catch (err) {
      setFeedback({
        severity: MessageCardSeverity.Error,
        text: `Failed to save settings: ${(err as Error).message}`,
      });
    } finally {
      setSaving(false);
    }
  }

  if (loadingState === "loading") {
    return <Spinner size={SpinnerSize.large} label="Loading settings…" />;
  }

  const hasChanges =
    selectedProjectId !== (currentRestriction?.id ?? NO_RESTRICTION_ID);

  return (
    <Card
      className="bolt-card-white"
      titleProps={{ text: "Template Source Restriction" }}
    >
      <div className="rhythm-vertical-16" style={{ padding: "8px 0" }}>
        <p className="body-m secondary-text" style={{ margin: 0 }}>
          By default, the Project Scaffolding hub discovers templates from all
          projects in this collection. You can restrict discovery to a single
          project so that only templates from that project are shown to users.
        </p>

        {feedback && (
          <MessageCard severity={feedback.severity}>
            {feedback.text}
          </MessageCard>
        )}

        <FormItem label="Template source project">
          <Dropdown
            items={dropdownItems}
            selection={dropdownSelection}
            onSelect={(_e, item) => setSelectedProjectId(item.id as string)}
            disabled={saving}
          />
        </FormItem>

        <div className="flex-row rhythm-horizontal-8">
          <Button
            text="Save"
            primary
            disabled={!hasChanges || saving}
            onClick={() => void handleSave()}
          />
        </div>
      </div>
    </Card>
  );
}
