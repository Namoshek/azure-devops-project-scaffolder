import { useState, useEffect } from "react";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { OTHERS_CATEGORY_NAME } from "../../Hub/types/templateTypes";
import {
  getTemplateCategories,
  setTemplateCategories,
} from "../../Hub/services/extensionSettingsService";

export interface UseCategoryEditorResult {
  loadingState: "loading" | "ready" | "error";
  categories: string[];
  newCategoryName: string;
  saving: boolean;
  feedback: { severity: MessageCardSeverity; text: string } | null;
  canAdd: boolean;
  hasChanges: boolean;
  setNewCategoryName: (name: string) => void;
  handleAddCategory: () => void;
  handleRemoveCategory: (index: number) => void;
  handleMoveCategory: (index: number, direction: "up" | "down") => void;
  handleSave: () => void;
}

export function useCategoryEditor(): UseCategoryEditorResult {
  const [loadingState, setLoadingState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [categories, setCategories] = useState<string[]>([]);
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    severity: MessageCardSeverity;
    text: string;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const stored = await getTemplateCategories();
        setCategories(stored);
        setSavedCategories(stored);
        setLoadingState("ready");
      } catch (err) {
        setLoadingState("error");
        setFeedback({
          severity: MessageCardSeverity.Error,
          text: `Failed to load template categories: ${(err as Error).message}`,
        });
      }
    }
    void load();
  }, []);

  function handleAddCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      return;
    }
    setCategories((prev) => [...prev, trimmed]);
    setNewCategoryName("");
    setFeedback(null);
  }

  function handleRemoveCategory(index: number) {
    setCategories((prev) => prev.filter((_, i) => i !== index));
    setFeedback(null);
  }

  function handleMoveCategory(index: number, direction: "up" | "down") {
    setCategories((prev) => {
      const next = [...prev];
      const swapWith = direction === "up" ? index - 1 : index + 1;
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      return next;
    });
    setFeedback(null);
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      await setTemplateCategories(categories);
      setSavedCategories([...categories]);
      setFeedback({
        severity: MessageCardSeverity.Info,
        text: "Template categories saved successfully.",
      });
    } catch (err) {
      setFeedback({
        severity: MessageCardSeverity.Error,
        text: `Failed to save template categories: ${(err as Error).message}`,
      });
    } finally {
      setSaving(false);
    }
  }

  const trimmedNew = newCategoryName.trim();
  const isDuplicate =
    trimmedNew.toLowerCase() === OTHERS_CATEGORY_NAME.toLowerCase() ||
    categories.some((c) => c.toLowerCase() === trimmedNew.toLowerCase());
  const canAdd = trimmedNew.length > 0 && !isDuplicate;

  const hasChanges =
    categories.length !== savedCategories.length ||
    categories.some((c, i) => c !== savedCategories[i]);

  return {
    loadingState,
    categories,
    newCategoryName,
    saving,
    feedback,
    canAdd,
    hasChanges,
    setNewCategoryName,
    handleAddCategory,
    handleRemoveCategory,
    handleMoveCategory,
    handleSave,
  };
}
