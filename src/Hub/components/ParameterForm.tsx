import React, { useState, useEffect, useRef } from "react";
import {
  TemplateDefinition,
  TemplateParameter,
  TemplatePermissions,
} from "../types/templateTypes";
import {
  evaluateWhenExpression,
  renderTemplate,
} from "../services/templateEngineService";
import {
  checkTemplateResourcesExistence,
  ResourceExistenceMap,
} from "../services/preflightCheckService";
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
  projectId: string;
  onSubmit: (values: Record<string, unknown>) => void;
  onBack: () => void;
}

// ─── Color constants ───────────────────────────────────────────────────────────
// green  = will be created successfully
// yellow = excluded by user-controlled when-expression (user can change this)
// red    = system-level blocker the user cannot resolve here
const COLOR_INCLUDED = "var(--status-success-foreground)";
const COLOR_EXCLUDED = "var(--status-warning-foreground)";
const COLOR_SYSTEM_ERROR = "var(--status-error-foreground)";

interface ParameterSummarySubItem {
  name: string;
  included: boolean;
}

interface ParameterSummaryItem {
  type: "repository" | "pipeline";
  name: string;
  included: boolean;
  permissionDenied: boolean;
  /** True when the resource already exists and has content — will be skipped. */
  existsWillSkip: boolean;
  /** True while the existence check is still in-flight for this item. */
  existsCheckPending: boolean;
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
  projectId,
  onSubmit,
  onBack,
}: ParameterFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildDefaults(template.parameters),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // ── Preflight existence checks ───────────────────────────────────────────────
  const [preflightChecks, setPreflightChecks] =
    useState<ResourceExistenceMap | null>(null);
  const [preflightPending, setPreflightPending] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPreflightPending(true);

    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      void checkTemplateResourcesExistence(projectId, template, values).then(
        (result) => {
          setPreflightChecks(result);
          setPreflightPending(false);
        },
        () => {
          // Fail open: if checks error out, leave preflightChecks as null.
          setPreflightPending(false);
        },
      );
    }, 500);

    return () => {
      if (debounceTimer.current !== null) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [values, projectId, template]);

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
      const renderedName = renderTemplate(r.name, values);
      const repoCheck = preflightChecks?.repos[renderedName.toLowerCase()];
      const permissionDenied =
        permissions !== null && !permissions.canCreateRepos;
      const existsWillSkip =
        included &&
        !permissionDenied &&
        (repoCheck?.exists && repoCheck.isNonEmpty) === true;
      const existsCheckPending =
        included &&
        !permissionDenied &&
        (preflightPending || repoCheck === undefined);
      return {
        type: "repository" as const,
        name: renderedName,
        included,
        permissionDenied,
        existsWillSkip,
        existsCheckPending,
        subItems,
      };
    }),
    ...(template.pipelines ?? []).map((p) => {
      const included = !p.when || evaluateWhenExpression(p.when, values);
      const renderedName = renderTemplate(p.name, values);
      const folder = p.folder ?? "\\";
      const pipelineKey = `${folder.toLowerCase()}::${renderedName.toLowerCase()}`;
      const pipelineCheck = preflightChecks?.pipelines[pipelineKey];
      const permissionDenied =
        permissions !== null && !permissions.canCreatePipelines;
      const existsWillSkip =
        included && !permissionDenied && pipelineCheck?.exists === true;
      const existsCheckPending =
        included &&
        !permissionDenied &&
        (preflightPending || pipelineCheck === undefined);
      return {
        type: "pipeline" as const,
        name: renderedName,
        included,
        permissionDenied,
        existsWillSkip,
        existsCheckPending,
      };
    }),
  ];

  // Submit is disabled when permissions are still loading, or when every
  // when-included resource is also permission-denied (nothing can be created).
  const includedItems = summaryItems.filter((i) => i.included);
  const allBlocked =
    permissions !== null &&
    includedItems.length > 0 &&
    includedItems.every((i) => i.permissionDenied || i.existsWillSkip);
  const submitDisabled = permissions === null || allBlocked;

  const submitTooltip = allBlocked
    ? "All resources are either permission-denied or already exist — nothing will be created."
    : permissions === null
      ? "Checking permissions..."
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
                Checking permissions...
              </span>
            </div>
          ) : (
            <div className="rhythm-vertical-8" style={{ width: "100%" }}>
              {summaryItems.map((item, index) => {
                const isLastItem = summaryItems.length - 1 === index;
                const wrapperClass = isLastItem
                  ? "flex-column justify-start"
                  : "flex-column justify-start separator-line-bottom";

                // Determine which system-level blocker applies (highest priority first).
                // Only one badge is shown per resource.
                const isSkipped =
                  !item.included ||
                  item.permissionDenied ||
                  item.existsWillSkip;

                const iconColor =
                  item.permissionDenied || item.existsWillSkip
                    ? COLOR_SYSTEM_ERROR
                    : !item.included
                      ? COLOR_EXCLUDED
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
                        className={isSkipped ? "secondary-text" : undefined}
                        style={isSkipped ? { opacity: 0.7 } : undefined}
                      >
                        {item.type === "repository" ? "Repository" : "Pipeline"}
                        : {item.name}
                        {isSkipped && (
                          <span style={{ marginLeft: 4 }}>(skipped)</span>
                        )}
                      </span>
                      {/* Existence check spinner — only for included, non-blocked items */}
                      {item.existsCheckPending && (
                        <Spinner
                          size={SpinnerSize.xSmall}
                          ariaLabel="Checking existence..."
                        />
                      )}
                      {/* Badge: priority order — system error > user-exclusion > success */}
                      {item.permissionDenied && (
                        <>
                          <Icon size={IconSize.small} iconName="Lock" />
                          <span
                            style={{
                              fontSize: 11,
                              color: COLOR_SYSTEM_ERROR,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            No permission
                          </span>
                        </>
                      )}
                      {!item.permissionDenied && item.existsWillSkip && (
                        <span
                          style={{
                            fontSize: 11,
                            color: COLOR_SYSTEM_ERROR,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Already exists
                        </span>
                      )}
                      {!item.included && !item.permissionDenied && (
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
                    </div>
                    {/* File sub-items (repositories only) */}
                    {item.subItems && (
                      <div
                        className="flex-column"
                        style={{
                          paddingLeft: 24,
                          gap: 4,
                          opacity: isSkipped ? 0.4 : 1,
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
                              className={
                                sub.included ? undefined : "secondary-text"
                              }
                              style={
                                sub.included ? undefined : { opacity: 0.7 }
                              }
                            >
                              {sub.name}
                              {!sub.included && (
                                <span style={{ marginLeft: 4 }}>(skipped)</span>
                              )}
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
