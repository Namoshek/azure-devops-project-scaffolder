import React, { useState, useMemo, useEffect } from "react";
import { TemplateDefinition, TemplateParameter } from "../types/templateTypes";
import { evaluateWhenExpression } from "../services/templateEngineService";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Checkbox } from "azure-devops-ui/Components/Checkbox/Checkbox";
import { Dropdown } from "azure-devops-ui/Components/Dropdown/Dropdown";
import { FormItem as FormItemBase } from "azure-devops-ui/Components/FormItem/FormItem";
import { TextField } from "azure-devops-ui/Components/TextField/TextField";
const FormItem = FormItemBase as React.ComponentType<
  React.ComponentProps<typeof FormItemBase> & { children?: React.ReactNode }
>;
import { IListBoxItem } from "azure-devops-ui/Components/ListBox/ListBox.Props";
import { DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { TitleSize } from "azure-devops-ui/Header";
import { Icon, IconSize } from "azure-devops-ui/Icon";

interface ParameterFormProps {
  template: TemplateDefinition;
  isAdmin: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
  onBack: () => void;
}

interface ParameterSummaryItem {
  type: "repository" | "pipeline";
  name: string;
}

function buildDefaults(
  parameters: TemplateParameter[],
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const p of parameters) {
    if (p.defaultValue !== undefined) {
      defaults[p.id] = p.defaultValue;
    } else if (p.type === "boolean") {
      defaults[p.id] = false;
    } else if (p.type === "choice" && p.options && p.options.length > 0) {
      defaults[p.id] = p.options[0];
    } else {
      defaults[p.id] = "";
    }
  }
  return defaults;
}

export function ParameterForm({
  template,
  isAdmin,
  onSubmit,
  onBack,
}: ParameterFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildDefaults(template.parameters),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function handleChange(id: string, value: unknown) {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: "" }));
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    for (const param of template.parameters) {
      if (param.when && !evaluateWhenExpression(param.when, values)) continue;

      const value = values[param.id];

      if (param.required) {
        if (
          param.type === "string" &&
          (value === "" || value === undefined || value === null)
        ) {
          errs[param.id] = `${param.label} is required.`;
          continue;
        }
      }

      if (param.validation && typeof value === "string" && value !== "") {
        try {
          const regex = new RegExp(param.validation.regex);
          if (!regex.test(value)) {
            errs[param.id] = param.validation.message;
          }
        } catch {
          // Invalid regex in template -- skip validation
        }
      }
    }

    return errs;
  }

  function handleSubmit() {
    setSubmitted(true);

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    onSubmit(values);
  }

  const visibleParams = template.parameters.filter(
    (p) => !p.when || evaluateWhenExpression(p.when, values),
  );

  const summaryItems: ParameterSummaryItem[] = [
    ...(template.repositories ?? []).map((r) => ({
      type: "repository" as const,
      name: r.name,
    })),
    ...(template.pipelines ?? []).map((p) => ({
      type: "pipeline" as const,
      name: p.name,
    })),
  ];

  return (
    <div className="flex-row" style={{ gap: 48 }}>
      <div>
        <div
          className="flex-row rhythm-horizontal-8"
          style={{ marginBottom: 24 }}
        >
          <div>
            <div className="title-m">Selected Template: {template.name}</div>
            {template.description && (
              <p
                className="body-m secondary-text"
                style={{ margin: "4px 0 0" }}
              >
                {template.description}
              </p>
            )}
          </div>
        </div>

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
            By submitting this form, the resources will be created as displayed
            on the right side.
          </p>
        </div>

        <div className="flex-row rhythm-horizontal-8" style={{ marginTop: 24 }}>
          <Button text="Cancel" onClick={onBack} />
          <Button
            text="Scaffold Project"
            primary
            disabled={!isAdmin}
            tooltipProps={
              !isAdmin
                ? {
                    text: "You need Project Administrator permissions to scaffold projects.",
                  }
                : undefined
            }
            onClick={handleSubmit}
          />
        </div>
      </div>

      <div style={{ minWidth: 400 }}>
        <Card
          className="bolt-card-white"
          titleProps={{ text: "Summary", size: TitleSize.Medium }}
        >
          <div className="rhythm-vertical-8" style={{ width: "100%" }}>
            {summaryItems.map((item, index) => {
              const isLastItem = summaryItems.length - 1 === index;
              const className = isLastItem
                ? "flex-row justify-start"
                : "flex-row justify-start separator-line-bottom";

              return (
                <div
                  key={index}
                  className={className}
                  style={{ gap: 16, paddingBottom: isLastItem ? 0 : 12 }}
                >
                  <Icon
                    size={IconSize.medium}
                    iconName={
                      item.type === "repository" ? "OpenSource" : "Build"
                    }
                  />{" "}
                  {item.type === "repository" ? "Repository" : "Pipeline"}:{" "}
                  {item.name}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// --- ParameterField ---

interface ParameterFieldProps {
  param: TemplateParameter;
  value: unknown;
  error?: string;
  onChange: (id: string, value: unknown) => void;
}

function ParameterField({
  param,
  value,
  error,
  onChange,
}: ParameterFieldProps) {
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
      <FormItem label={param.label} message={param.hint}>
        <Checkbox
          label={Boolean(value) ? "Yes" : "No"}
          checked={Boolean(value)}
          onChange={(_e, checked) => onChange(param.id, checked)}
        />
      </FormItem>
    );
  }

  if (param.type === "choice" && param.options) {
    return (
      <FormItem
        label={param.label}
        required={param.required}
        message={hasError ? error : param.hint}
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
      label={param.label}
      required={param.required}
      message={hasError ? error : param.hint}
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
