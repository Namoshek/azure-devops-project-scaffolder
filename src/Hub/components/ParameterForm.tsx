import React, { useState } from "react";
import {
  TemplateDefinition,
  TemplateParameter,
  TemplatePermissions,
} from "../types/templateTypes";
import {
  evaluateWhenExpression,
  renderTemplate,
} from "../services/templateEngineService";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { TitleSize } from "azure-devops-ui/Header";
import { Icon, IconSize } from "azure-devops-ui/Icon";
import { ParameterField } from "./ParameterField";

interface ParameterFormProps {
  template: TemplateDefinition;
  permissions: TemplatePermissions | null;
  onSubmit: (values: Record<string, unknown>) => void;
  onBack: () => void;
}

const COLOR_INCLUDED = "var(--status-success-foreground)";
const COLOR_EXCLUDED = "var(--status-error-foreground)";
const COLOR_NO_PERMISSION = "var(--status-warning-foreground)";

interface ParameterSummarySubItem {
  name: string;
  included: boolean;
}

interface ParameterSummaryItem {
  type: "repository" | "pipeline";
  name: string;
  included: boolean;
  permissionDenied: boolean;
  subItems?: ParameterSummarySubItem[];
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
  permissions,
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
    ...(template.repositories ?? []).map((r) => {
      const included = !r.when || evaluateWhenExpression(r.when, values);
      const conditionalExcludes = (r.exclude ?? []).filter((e) => !!e.when);
      const subItems: ParameterSummarySubItem[] = [
        { name: "All non-conditional files", included },
        ...conditionalExcludes.map((e) => ({
          name: e.path,
          included: !evaluateWhenExpression(e.when!, values),
        })),
      ];
      return {
        type: "repository" as const,
        name: renderTemplate(r.name, values),
        included,
        permissionDenied: permissions !== null && !permissions.canCreateRepos,
        subItems,
      };
    }),
    ...(template.pipelines ?? []).map((p) => ({
      type: "pipeline" as const,
      name: renderTemplate(p.name, values),
      included: !p.when || evaluateWhenExpression(p.when, values),
      permissionDenied: permissions !== null && !permissions.canCreatePipelines,
    })),
  ];

  // Submit is disabled when permissions are still loading, or when every
  // when-included resource is also permission-denied (nothing can be created).
  const includedItems = summaryItems.filter((i) => i.included);
  const allDenied =
    permissions !== null &&
    includedItems.length > 0 &&
    includedItems.every((i) => i.permissionDenied);
  const submitDisabled = permissions === null || allDenied;

  const submitTooltip = allDenied
    ? "You don't have the required permissions for any of this template's resources."
    : permissions === null
      ? "Checking permissionsâ€¦"
      : undefined;

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
            disabled={submitDisabled}
            tooltipProps={submitTooltip ? { text: submitTooltip } : undefined}
            onClick={handleSubmit}
          />
        </div>
      </div>

      <div style={{ minWidth: 400 }}>
        <Card
          className="bolt-card-white"
          titleProps={{ text: "Summary", size: TitleSize.Medium }}
        >
          {permissions === null ? (
            <div
              className="flex-row flex-center"
              style={{ gap: 8, padding: "8px 0" }}
            >
              <Spinner size={SpinnerSize.small} />
              <span className="body-s secondary-text">
                Checking permissionsâ€¦
              </span>
            </div>
          ) : (
            <div className="rhythm-vertical-8" style={{ width: "100%" }}>
              {summaryItems.map((item, index) => {
                const isLastItem = summaryItems.length - 1 === index;
                const wrapperClass = isLastItem
                  ? "flex-column justify-start"
                  : "flex-column justify-start separator-line-bottom";

                // Determine visual state: permission-denied overrides included style
                // but only applies to when-included items.
                const effectivelyBlocked =
                  item.included && item.permissionDenied;
                const iconColor = !item.included
                  ? COLOR_EXCLUDED
                  : effectivelyBlocked
                    ? COLOR_NO_PERMISSION
                    : COLOR_INCLUDED;

                return (
                  <div
                    key={index}
                    className={wrapperClass}
                    style={{ gap: 6, paddingBottom: isLastItem ? 0 : 12 }}
                  >
                    {/* Main resource row */}
                    <div
                      className="flex-row"
                      style={{ gap: 8, alignItems: "center" }}
                    >
                      <span style={{ color: iconColor }}>
                        <Icon
                          size={IconSize.medium}
                          iconName={
                            item.type === "repository" ? "OpenSource" : "Build"
                          }
                        />
                      </span>
                      <span
                        style={
                          !item.included
                            ? { textDecoration: "line-through", opacity: 0.5 }
                            : undefined
                        }
                      >
                        {item.type === "repository" ? "Repository" : "Pipeline"}
                        : {item.name}
                      </span>
                      {!item.included && (
                        <span
                          style={{
                            fontSize: 11,
                            color: COLOR_EXCLUDED,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Excluded
                        </span>
                      )}
                      {effectivelyBlocked && (
                        <>
                          <Icon size={IconSize.small} iconName="Lock" />
                          <span
                            style={{
                              fontSize: 11,
                              color: COLOR_NO_PERMISSION,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            No permission
                          </span>
                        </>
                      )}
                    </div>
                    {/* File sub-items (repositories only) */}
                    {item.subItems && (
                      <div
                        className="flex-column"
                        style={{
                          paddingLeft: 24,
                          gap: 4,
                          opacity: item.included ? 1 : 0.4,
                        }}
                      >
                        {item.subItems.map((sub, si) => (
                          <div
                            key={si}
                            className="flex-row"
                            style={{ gap: 8, alignItems: "center" }}
                          >
                            <span
                              style={{
                                color: sub.included
                                  ? COLOR_INCLUDED
                                  : COLOR_EXCLUDED,
                              }}
                            >
                              <Icon size={IconSize.small} iconName="Page" />
                            </span>
                            <span
                              className="body-s"
                              style={
                                sub.included
                                  ? undefined
                                  : {
                                      textDecoration: "line-through",
                                      opacity: 0.6,
                                    }
                              }
                            >
                              {sub.name}
                            </span>
                            {!sub.included && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: COLOR_EXCLUDED,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                }}
                              >
                                Excluded
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
