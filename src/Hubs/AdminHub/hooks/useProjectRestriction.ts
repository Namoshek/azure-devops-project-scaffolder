import { useState, useEffect, useRef } from "react";
import { getClient } from "azure-devops-extension-api";
import { CoreRestClient } from "azure-devops-extension-api/Core";
import { TeamProjectReference } from "azure-devops-extension-api/Core/Core";
import {
  getRestrictedProjects,
  setRestrictedProjects,
  RestrictedProject,
} from "../../../services/extensionSettingsService";
import { getErrorMessage } from "../../../utils/errorUtils";

export interface UseProjectRestrictionResult {
  loadingState: "loading" | "ready" | "error";
  saving: boolean;
  feedback: { type: "success" | "error"; text: string } | null;
  allProjects: TeamProjectReference[];
  checkedIds: ReadonlySet<string>;
  hasChanges: boolean;
  handleToggle: (id: string) => void;
  setAllChecked: (ids: ReadonlySet<string>) => void;
  handleSave: () => Promise<void>;
}

export function useProjectRestriction(): UseProjectRestrictionResult {
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "error">("loading");
  const [allProjects, setAllProjects] = useState<TeamProjectReference[]>([]);
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [projects, restrictions] = await Promise.all([
          getClient(CoreRestClient).getProjects(),
          getRestrictedProjects(),
        ]);

        const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
        setAllProjects(sorted);

        const ids = new Set(restrictions.map((r: RestrictedProject) => r.id));
        setSavedIds(ids);
        setCheckedIds(new Set(ids));
        setLoadingState("ready");
      } catch (err) {
        setLoadingState("error");
        setFeedback({
          type: "error",
          text: `Failed to load settings: ${getErrorMessage(err)}`,
        });
      }
    }
    void load();
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current !== null) {
        clearTimeout(feedbackTimer.current);
      }
    };
  }, []);

  function handleToggle(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function setAllChecked(ids: ReadonlySet<string>) {
    setCheckedIds(new Set(ids));
  }

  async function handleSave() {
    setSaving(true);
    if (feedbackTimer.current !== null) {
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }
    setFeedback(null);
    try {
      const selectedProjects: RestrictedProject[] = allProjects
        .filter((p) => checkedIds.has(p.id!))
        .map((p) => ({ id: p.id!, name: p.name }));
      await setRestrictedProjects(selectedProjects);
      setSavedIds(new Set(checkedIds));
      setFeedback({ type: "success", text: "Saved successfully" });
      feedbackTimer.current = setTimeout(() => {
        setFeedback(null);
        feedbackTimer.current = null;
      }, 3000);
    } catch (err) {
      setFeedback({
        type: "error",
        text: `Failed to save settings: ${getErrorMessage(err)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = (() => {
    if (checkedIds.size !== savedIds.size) return true;
    for (const id of checkedIds) {
      if (!savedIds.has(id)) return true;
    }
    return false;
  })();

  return {
    loadingState,
    saving,
    feedback,
    allProjects,
    checkedIds,
    hasChanges,
    handleToggle,
    setAllChecked,
    handleSave,
  };
}
