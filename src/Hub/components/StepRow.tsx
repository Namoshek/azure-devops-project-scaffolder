import React, { useState } from "react";
import { ScaffoldStep } from "../services/scaffoldingOrchestrator";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { StepStatusIcon } from "./StepStatusIcon";

export interface StepRowProps {
  step: ScaffoldStep;
}

export function StepRow({ step }: StepRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(step.detail);

  return (
    <Card>
      <div className="flex-column">
        <div className="flex-row flex-center" style={{ gap: 12 }}>
          <StepStatusIcon status={step.status} />
          <span className="body-m flex-grow">{step.label}</span>
          {hasDetail && (
            <Button
              text={expanded ? "Hide details" : "Show details"}
              subtle
              onClick={() => setExpanded((prev) => !prev)}
            />
          )}
        </div>
        {expanded && step.detail && (
          <div
            className="body-s secondary-text"
            style={{ marginTop: 8, paddingLeft: 32 }}
          >
            {step.detail}
          </div>
        )}
      </div>
    </Card>
  );
}
