import React, { useMemo, useEffect } from "react";
import { renderTemplatePreview } from "../../../../services/templateEngineService";
import { Checkbox } from "azure-devops-ui/Components/Checkbox/Checkbox";
import { Dropdown } from "azure-devops-ui/Components/Dropdown/Dropdown";
import { FormItem as FormItemBase } from "azure-devops-ui/Components/FormItem/FormItem";
import { TextField } from "azure-devops-ui/Components/TextField/TextField";
import { IListBoxItem } from "azure-devops-ui/Components/ListBox/ListBox.Props";
import { DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import { TemplateParameter } from "src/types/templateTypes";

const FormItem = FormItemBase as React.ComponentType<
  React.ComponentProps<typeof FormItemBase> & { children?: React.ReactNode }
>;

export interface ParameterFieldProps {
  param: TemplateParameter;
  value: unknown;
  error?: string;
  values: Record<string, unknown>;
  onChange: (id: string, value: unknown) => void;
}

export function ParameterField({ param, value, error, values, onChange }: ParameterFieldProps) {
  const dropdownSelection = useMemo(() => new DropdownSelection(), []);
  const dropdownItems = useMemo<IListBoxItem[]>(
    () => (param.options || []).map((opt) => ({ id: opt, text: opt })),
    [param.options],
  );

  useEffect(() => {
    if (param.type === "choice" && param.options) {
      const idx = param.options.indexOf(typeof value === "string" ? value : "");
      if (idx >= 0) {
        dropdownSelection.select(idx);
      }
    }
  }, [value, param.options, param.type, dropdownSelection]);

  const hasError = Boolean(error);

  if (param.type === "boolean") {
    return (
      <FormItem label={renderTemplatePreview(param.label, values)} message={renderTemplatePreview(param.hint, values)}>
        <Checkbox
          label={value ? "Yes" : "No"}
          checked={Boolean(value)}
          onChange={(_e, checked) => onChange(param.id, checked)}
        />
      </FormItem>
    );
  }

  if (param.type === "choice" && param.options) {
    return (
      <FormItem
        label={renderTemplatePreview(param.label, values)}
        required={param.required}
        message={hasError ? error : renderTemplatePreview(param.hint, values)}
        error={hasError}
      >
        <Dropdown
          items={dropdownItems}
          selection={dropdownSelection}
          onSelect={(_e, item) => onChange(param.id, item.id)}
        />
      </FormItem>
    );
  }

  // string / secret
  return (
    <FormItem
      label={renderTemplatePreview(param.label, values)}
      required={param.required}
      message={hasError ? error : renderTemplatePreview(param.hint, values)}
      error={hasError}
    >
      <TextField
        value={typeof value === "string" ? value : ""}
        inputType={param.secret ? "password" : "text"}
        autoComplete={param.secret ? false : undefined}
        onChange={(_e, newValue) => onChange(param.id, newValue)}
      />
    </FormItem>
  );
}
