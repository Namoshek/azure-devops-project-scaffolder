import React, { useState } from "react";
import { ScaffoldStep } from "../../../../services/scaffoldingOrchestrator";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { StepStatusIcon } from "./StepStatusIcon";

export interface StepRowProps {
  step: ScaffoldStep;
  isLast: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function StepRow({ step, isLast }: StepRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(step.detail);

  return (
    <div
      className={`flex-column ${isLast ? "" : "separator-line-bottom"}`}
      style={{
        padding: "16px 16px",
      }}
    >
      <div className="flex-row flex-center" style={{ gap: 12 }}>
        <StepStatusIcon status={step.status} />
        <span className="body-m flex-grow">{step.label}</span>
        {hasDetail && (
          <Button
            text={expanded ? "Hide details" : "Show details"}
            subtle
            ariaExpanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
          />
        )}
        {step.duration !== undefined && <span className="secondary-text body-s">{formatDuration(step.duration)}</span>}
      </div>
      {expanded && step.detail && (
        <div className="body-s secondary-text" style={{ marginTop: 8, paddingLeft: 36 }}>
          {step.detail}
        </div>
      )}
    </div>
  );
}
