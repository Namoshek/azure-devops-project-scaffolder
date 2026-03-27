import { useState, useEffect, useMemo } from "react";
import { getClient } from "azure-devops-extension-api";
import { CoreRestClient } from "azure-devops-extension-api/Core";
import { TeamProjectReference } from "azure-devops-extension-api/Core/Core";
import { IListBoxItem } from "azure-devops-ui/Components/ListBox/ListBox.Props";
import { DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import {
  getRestrictedProject,
  setRestrictedProject,
  clearRestrictedProject,
  RestrictedProject,
} from "../../Hub/services/extensionSettingsService";

export const NO_RESTRICTION_ID = "__none__";

function buildItems(projectList: TeamProjectReference[]): IListBoxItem[] {
  return [
    { id: NO_RESTRICTION_ID, text: "No restriction (entire collection)" },
    ...projectList.map((p) => ({ id: p.id!, text: p.name })),
  ];
}

export interface UseProjectRestrictionResult {
  loadingState: "loading" | "ready" | "error";
  saving: boolean;
  feedback: { severity: MessageCardSeverity; text: string } | null;
  dropdownItems: IListBoxItem[];
  dropdownSelection: DropdownSelection;
  hasChanges: boolean;
  setSelectedProjectId: (id: string) => void;
  handleSave: () => void;
}

export function useProjectRestriction(): UseProjectRestrictionResult {
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

  const hasChanges =
    selectedProjectId !== (currentRestriction?.id ?? NO_RESTRICTION_ID);

  return {
    loadingState,
    saving,
    feedback,
    dropdownItems,
    dropdownSelection,
    hasChanges,
    setSelectedProjectId,
    handleSave,
  };
}
