import React, { useState, useEffect, useRef, ReactElement } from "react";
import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IProjectPageService,
} from "azure-devops-extension-api";
import { TemplateDefinition } from "../types/templateTypes";
import {
  runScaffold,
  ScaffoldResult,
  ScaffoldStep,
} from "../services/scaffoldingOrchestrator";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Status, Statuses } from "azure-devops-ui/Components/Status/Status";
import { StatusSize } from "azure-devops-ui/Components/Status/Status.Props";

interface ScaffoldProgressProps {
  template: TemplateDefinition;
  parameterValues: Record<string, unknown>;
  results: ScaffoldResult[];
  onComplete: (results: ScaffoldResult[]) => void;
  onScaffoldAgain: () => void;
}

export function ScaffoldProgress({
  template,
  parameterValues,
  results,
  onComplete,
  onScaffoldAgain,
}: ScaffoldProgressProps) {
  const [steps, setSteps] = useState<ScaffoldStep[]>(
    results.length > 0 ? results : [],
  );
  const [running, setRunning] = useState(results.length === 0);
  const [done, setDone] = useState(results.length > 0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const stepsRef = useRef<ScaffoldStep[]>(steps);

  useEffect(() => {
    if (results.length > 0) return;
    void runOrchestration();
  }, []);

  async function runOrchestration() {
    let projectId: string;
    try {
      const projectService = await SDK.getService<IProjectPageService>(
        CommonServiceIds.ProjectPageService,
      );
      const project = await projectService.getProject();
      if (!project) throw new Error("Could not determine current project.");
      projectId = project.id;
    } catch (err) {
      setRunning(false);
      setDone(true);
      setFatalError(
        `Failed to determine current project: ${(err as Error).message}`,
      );
      return;
    }

    try {
      await runScaffold(
        projectId,
        template,
        parameterValues,
        (updatedSteps) => {
          const copy = [...updatedSteps];
          stepsRef.current = copy;
          setSteps(copy);
        },
      );
    } catch (err) {
      setFatalError(`Unexpected error: ${(err as Error).message}`);
    }

    onComplete(stepsRef.current);
    setRunning(false);
    setDone(true);
  }

  const hasFailures = steps.some((s) => s.status === "failed");

  const titleText = running
    ? "Scaffolding in progress..."
    : done && !hasFailures
      ? "Scaffold complete!"
      : "Scaffold finished with issues";

  return (
    <div className="flex-column rhythm-vertical-16" style={{ maxWidth: 720 }}>
      <div>
        <div className="title-m">{titleText}</div>
        <p className="body-m secondary-text" style={{ margin: "4px 0 0" }}>
          Template: <strong>{template.name}</strong>
        </p>
      </div>

      {fatalError && (
        <MessageCard severity={MessageCardSeverity.Error}>
          <strong>Fatal error</strong>
          <p style={{ margin: "8px 0 0" }}>{fatalError}</p>
        </MessageCard>
      )}

      <div className="flex-column rhythm-vertical-4">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </div>

      {done && (
        <div>
          <Button text="Scaffold Another Project" onClick={onScaffoldAgain} />
        </div>
      )}
    </div>
  );
}

// --- StepRow ---

interface StepRowProps {
  step: ScaffoldStep;
}

function StepRow({ step }: StepRowProps) {
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

function StepStatusIcon({
  status,
}: {
  status: ScaffoldStep["status"];
}): ReactElement {
  const statusMap: Record<ScaffoldStep["status"], ReactElement> = {
    pending: (
      <Status {...Statuses.Waiting} size={StatusSize.m} ariaLabel="Pending" />
    ),
    running: (
      <Status {...Statuses.Running} size={StatusSize.m} ariaLabel="Running" />
    ),
    success: (
      <Status {...Statuses.Success} size={StatusSize.m} ariaLabel="Success" />
    ),
    skipped: (
      <Status {...Statuses.Skipped} size={StatusSize.m} ariaLabel="Skipped" />
    ),
    failed: (
      <Status {...Statuses.Failed} size={StatusSize.m} ariaLabel="Failed" />
    ),
  };
  return statusMap[status];
}
