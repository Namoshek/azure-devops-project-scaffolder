import React, { useState, useEffect } from "react";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { TextField } from "azure-devops-ui/Components/TextField/TextField";
import { FormItem as FormItemBase } from "azure-devops-ui/Components/FormItem/FormItem";
import { OTHERS_CATEGORY_NAME } from "../../Hub/types/templateTypes";
import {
  getTemplateCategories,
  setTemplateCategories,
} from "../../Hub/services/extensionSettingsService";

const FormItem = FormItemBase as React.ComponentType<
  React.ComponentProps<typeof FormItemBase> & { children?: React.ReactNode }
>;

export function TemplateCategorySettings() {
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
    if (!trimmed) return;
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

  if (loadingState === "loading") {
    return <Spinner size={SpinnerSize.large} label="Loading settings…" />;
  }

  const trimmedNew = newCategoryName.trim();
  const isDuplicate =
    trimmedNew.toLowerCase() === OTHERS_CATEGORY_NAME.toLowerCase() ||
    categories.some((c) => c.toLowerCase() === trimmedNew.toLowerCase());
  const canAdd = trimmedNew.length > 0 && !isDuplicate;

  const hasChanges =
    categories.length !== savedCategories.length ||
    categories.some((c, i) => c !== savedCategories[i]);

  return (
    <Card
      className="bolt-card-white"
      titleProps={{ text: "Template Categories" }}
    >
      <div className="rhythm-vertical-16" style={{ padding: "8px 0" }}>
        <p className="body-m secondary-text" style={{ margin: 0 }}>
          Define the categories shown in the template selection panel. Templates
          can declare one or more categories via the{" "}
          <code>templateCategories</code> field in their{" "}
          <code>project-template.yml</code>. Templates that do not match any
          configured category are listed under &ldquo;
          {OTHERS_CATEGORY_NAME}&rdquo;.
        </p>

        {feedback && (
          <MessageCard severity={feedback.severity}>
            {feedback.text}
          </MessageCard>
        )}

        <div className="rhythm-vertical-8">
          {categories.map((category, index) => (
            <div
              key={index}
              className="flex-row flex-center rhythm-horizontal-8"
              style={{ gap: 8 }}
            >
              <div className="flex-column" style={{ gap: 0 }}>
                <Button
                  iconProps={{ iconName: "ChevronUp" }}
                  subtle
                  ariaLabel={`Move "${category}" up`}
                  disabled={saving || index === 0}
                  onClick={() => handleMoveCategory(index, "up")}
                />
                <Button
                  iconProps={{ iconName: "ChevronDown" }}
                  subtle
                  ariaLabel={`Move "${category}" down`}
                  disabled={saving || index === categories.length - 1}
                  onClick={() => handleMoveCategory(index, "down")}
                />
              </div>
              <span className="body-m" style={{ flex: 1 }}>
                {category}
              </span>
              <Button
                iconProps={{ iconName: "Cancel" }}
                subtle
                ariaLabel={`Remove category "${category}"`}
                disabled={saving}
                onClick={() => handleRemoveCategory(index)}
              />
            </div>
          ))}

          {/* Informational "Others" row — always last, non-removable */}
          <div
            className="flex-row flex-center"
            style={{ gap: 8, opacity: 0.5 }}
          >
            <span className="body-m" style={{ flex: 1 }}>
              {OTHERS_CATEGORY_NAME} <em>(default — always last)</em>
            </span>
          </div>
        </div>

        <FormItem label="New category name">
          <div className="flex-row rhythm-horizontal-8" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}>
              <TextField
                value={newCategoryName}
                onChange={(_e, val) => setNewCategoryName(val)}
                placeholder="e.g. Backend"
                disabled={saving}
              />
            </div>
            <Button
              text="Add Category"
              disabled={!canAdd || saving}
              onClick={handleAddCategory}
            />
          </div>
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
