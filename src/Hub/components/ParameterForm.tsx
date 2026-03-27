import React from "react";
import {
  TemplateDefinition,
  TemplatePermissions,
} from "../types/templateTypes";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { TitleSize } from "azure-devops-ui/Header";
import { Icon, IconSize } from "azure-devops-ui/Icon";
import { ParameterField } from "./ParameterField";
import { useParameterForm } from "../hooks/useParameterForm";

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

export function ParameterForm({
  template,
  permissions,
  projectId,
  onSubmit,
  onBack,
}: ParameterFormProps) {
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
