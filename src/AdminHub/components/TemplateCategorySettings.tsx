import React from "react";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { TextField } from "azure-devops-ui/Components/TextField/TextField";
import { FormItem as FormItemBase } from "azure-devops-ui/Components/FormItem/FormItem";
import { OTHERS_CATEGORY_NAME } from "../../Hub/types/templateTypes";
import { useCategoryEditor } from "../hooks/useCategoryEditor";

const FormItem = FormItemBase as React.ComponentType<
  React.ComponentProps<typeof FormItemBase> & { children?: React.ReactNode }
>;

export function TemplateCategorySettings() {
  const {
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
  } = useCategoryEditor();

  if (loadingState === "loading") {
    return <Spinner size={SpinnerSize.large} label="Loading settings…" />;
  }

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

        <div className="flex-row flex-center" style={{ gap: 8 }}>
          <Button
            text="Save"
            primary
            disabled={!hasChanges || saving}
            onClick={() => void handleSave()}
          />
          {feedback && (
            <span
              className="body-m"
              style={
                feedback.type === "error"
                  ? { color: "var(--status-error-foreground)" }
                  : { color: "var(--status-success-foreground)" }
              }
            >
              {feedback.text}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
