import React from "react";
import { ParameterSummaryItem, ParameterSummarySubItem } from "../../../../utils/summaryBuilder";
import { statusColors } from "../../../../types/statusColors";
import { Icon, IconSize } from "azure-devops-ui/Icon";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";

// ─── Color aliases ─────────────────────────────────────────────────────────────
// success = will be created
const COLOR_INCLUDED = statusColors.success;
// warning = excluded by user-controlled when-expression (user can change this)
const COLOR_EXCLUDED = statusColors.warning;
// error   = system-level blocker the user cannot resolve here
const COLOR_SYSTEM_ERROR = statusColors.error;

interface SummaryResourceRowProps {
  item: ParameterSummaryItem;
  isLast: boolean;
}

export function SummaryResourceRow({ item, isLast }: SummaryResourceRowProps) {
  const wrapperClass = isLast ? "flex-column justify-start" : "flex-column justify-start separator-line-bottom";

  const isSkipped = !item.included || item.permissionDenied || item.existsWillSkip;
  const iconName = item.type === "repository" ? "OpenSource" : "Build";
  const resourceType = item.type === "repository" ? "Repository" : "Pipeline";

  // Determine which system-level blocker applies (highest priority first).
  // Only one badge is shown per resource.
  const iconColor =
    item.permissionDenied || item.existsWillSkip
      ? COLOR_SYSTEM_ERROR
      : !item.included
        ? COLOR_EXCLUDED
        : COLOR_INCLUDED;

  return (
    <div className={wrapperClass} style={{ gap: 6, paddingBottom: isLast ? 0 : 12 }}>
      <div className="flex-row" style={{ gap: 8, alignItems: "center" }}>
        <span style={{ color: iconColor }}>
          <Icon size={IconSize.medium} iconName={iconName} />
        </span>
        <span className={isSkipped ? "secondary-text" : undefined} style={isSkipped ? { opacity: 0.7 } : undefined}>
          {resourceType}: {item.name}
          {isSkipped && <span style={{ marginLeft: 4 }}>(skipped)</span>}
        </span>

        {item.existsCheckPending && <Spinner size={SpinnerSize.xSmall} ariaLabel="Checking existence..." />}

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

      {item.subItems && (
        <div
          className="flex-column"
          style={{
            paddingLeft: 24,
            gap: 4,
            opacity: isSkipped ? 0.4 : 1,
          }}
        >
          {item.subItems.map((sub: ParameterSummarySubItem, si: number) => (
            <div key={si} className="flex-row" style={{ gap: 8, alignItems: "center" }}>
              <span
                style={{
                  color: sub.included ? COLOR_INCLUDED : COLOR_EXCLUDED,
                }}
              >
                <Icon size={IconSize.small} iconName="Page" />
              </span>
              <span
                className={sub.included ? undefined : "secondary-text"}
                style={sub.included ? undefined : { opacity: 0.7 }}
              >
                {sub.name}
                {!sub.included && <span style={{ marginLeft: 4 }}>(skipped)</span>}
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
}
