import React, { useState, useEffect, useRef } from "react";
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
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { StepRow } from "./StepRow";

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

      {done &&
        !hasFailures &&
        template.postScaffoldNotes &&
        template.postScaffoldNotes.length > 0 && (
          <div className="flex-column rhythm-vertical-8">
            {template.postScaffoldNotes.map((note, i) => (
              <MessageCard key={i} severity={MessageCardSeverity.Info}>
                {note}
              </MessageCard>
            ))}
          </div>
        )}

      {done && (
        <div>
          <Button text="Scaffold Another Project" onClick={onScaffoldAgain} />
        </div>
      )}
    </div>
  );
}
