import React, { useState } from "react";
import { TemplateDefinition, TemplateParameter } from "../types/templateTypes";
import { evaluateWhenExpression } from "../services/templateEngineService";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { TitleSize } from "azure-devops-ui/Header";
import { Icon, IconSize } from "azure-devops-ui/Icon";
import { ParameterField } from "./ParameterField";

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

        {template.preScaffoldNotes && template.preScaffoldNotes.length > 0 && (
          <div
            className="flex-column rhythm-vertical-8"
            style={{ marginBottom: 20 }}
          >
            {template.preScaffoldNotes.map((note, i) => (
              <MessageCard key={i} severity={MessageCardSeverity.Info}>
                {note}
              </MessageCard>
            ))}
          </div>
        )}

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
