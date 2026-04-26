import { useState, useEffect, useRef } from "react";
import { OTHERS_CATEGORY_NAME } from "../../../types/templateTypes";
import { getTemplateCategories, setTemplateCategories } from "../../../services/extensionSettingsService";
import { getErrorMessage } from "../../../utils/errorUtils";

export interface UseCategoryEditorResult {
  loadingState: "loading" | "ready" | "error";
  categories: string[];
  newCategoryName: string;
  saving: boolean;
  feedback: { type: "success" | "error"; text: string } | null;
  canAdd: boolean;
  hasChanges: boolean;
  setNewCategoryName: (name: string) => void;
  handleAddCategory: () => void;
  handleRemoveCategory: (index: number) => void;
  handleMoveCategory: (index: number, direction: "up" | "down") => void;
  handleSave: () => void;
}

export function useCategoryEditor(): UseCategoryEditorResult {
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "error">("loading");
  const [categories, setCategories] = useState<string[]>([]);
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          type: "error",
          text: `Failed to load template categories: ${getErrorMessage(err)}`,
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
    if (feedbackTimer.current !== null) {
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }
    setFeedback(null);
    try {
      await setTemplateCategories(categories);
      setSavedCategories([...categories]);
      setFeedback({ type: "success", text: "Saved successfully" });
      feedbackTimer.current = setTimeout(() => {
        setFeedback(null);
        feedbackTimer.current = null;
      }, 3000);
    } catch (err) {
      setFeedback({
        type: "error",
        text: `Failed to save template categories: ${getErrorMessage(err)}`,
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
    categories.length !== savedCategories.length || categories.some((c, i) => c !== savedCategories[i]);

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
