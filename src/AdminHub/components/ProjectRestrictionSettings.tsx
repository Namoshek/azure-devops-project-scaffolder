import React from "react";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { Dropdown } from "azure-devops-ui/Components/Dropdown/Dropdown";
import { FormItem as FormItemBase } from "azure-devops-ui/Components/FormItem/FormItem";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { useProjectRestriction } from "../hooks/useProjectRestriction";

const FormItem = FormItemBase as React.ComponentType<
  React.ComponentProps<typeof FormItemBase> & { children?: React.ReactNode }
>;

export function ProjectRestrictionSettings() {
  const {
    loadingState,
    saving,
    feedback,
    dropdownItems,
    dropdownSelection,
    hasChanges,
    setSelectedProjectId,
    handleSave,
  } = useProjectRestriction();

  if (loadingState === "loading") {
    return <Spinner size={SpinnerSize.large} label="Loading settings…" />;
  }

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
