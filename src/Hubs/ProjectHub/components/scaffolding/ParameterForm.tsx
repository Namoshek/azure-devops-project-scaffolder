import React from "react";
import { TemplateDefinition, TemplatePermissions } from "../../../../types/templateTypes";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { ParameterField } from "./ParameterField";
import { TemplateFormHeader } from "./TemplateFormHeader";
import { ScaffoldSummaryPanel } from "./ScaffoldSummaryPanel";
import { useParameterForm } from "../../hooks/useParameterForm";

interface ParameterFormProps {
  template: TemplateDefinition;
  permissions: TemplatePermissions | null;
  projectId: string;
  onSubmit: (values: Record<string, unknown>) => void;
  onBack: () => void;
}

export function ParameterForm({ template, permissions, projectId, onSubmit, onBack }: ParameterFormProps) {
  const {
    values,
    errors,
    submitted,
    visibleParams,
    summaryItems,
    submitDisabled,
    submitTooltip,
    handleChange,
    handleSubmit,
  } = useParameterForm(template, permissions, projectId, onSubmit);

  return (
    <div className="flex-row" style={{ gap: 48 }}>
      <div>
        <TemplateFormHeader template={template} />

        <div className="flex-column rhythm-vertical-20">
          {visibleParams.map((param) => (
            <ParameterField
              key={param.id}
              param={param}
              value={values[param.id]}
              error={submitted ? errors[param.id] : undefined}
              onChange={handleChange}
            />
          ))}
        </div>

        <div className="flex-row rhythm-horizontal-8" style={{ marginTop: 32 }}>
          <p className="body-m secondary-text" style={{ margin: 0 }}>
            By submitting this form, the resources will be created as displayed on the right side.
          </p>
        </div>

        <div className="flex-row rhythm-horizontal-8" style={{ marginTop: 24 }}>
          <Button text="Cancel" onClick={onBack} />
          <Button
            text="Scaffold Project"
            primary
            disabled={submitDisabled}
            tooltipProps={submitTooltip ? { text: submitTooltip } : undefined}
            onClick={handleSubmit}
          />
        </div>
      </div>

      <div style={{ minWidth: 400 }}>
        <ScaffoldSummaryPanel permissions={permissions} summaryItems={summaryItems} />
      </div>
    </div>
  );
}
