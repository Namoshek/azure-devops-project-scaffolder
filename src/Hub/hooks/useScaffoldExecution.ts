import { useState, useEffect, useRef } from "react";
import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IProjectPageService,
} from "azure-devops-extension-api";
import {
  TemplateDefinition,
  TemplatePermissions,
} from "../types/templateTypes";
import {
  runScaffold,
  ScaffoldResult,
  ScaffoldStep,
} from "../services/scaffoldingOrchestrator";

export interface UseScaffoldExecutionResult {
  steps: ScaffoldStep[];
  running: boolean;
  done: boolean;
  fatalError: string | null;
  hasFailures: boolean;
  titleText: string;
}

export function useScaffoldExecution(
  template: TemplateDefinition,
  parameterValues: Record<string, unknown>,
  permissions: TemplatePermissions,
  existingResults: ScaffoldResult[],
  onComplete: (results: ScaffoldResult[]) => void,
): UseScaffoldExecutionResult {
  const [steps, setSteps] = useState<ScaffoldStep[]>(
    existingResults.length > 0 ? existingResults : [],
  );
  const [running, setRunning] = useState(existingResults.length === 0);
  const [done, setDone] = useState(existingResults.length > 0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const stepsRef = useRef<ScaffoldStep[]>(steps);

  useEffect(() => {
    if (existingResults.length > 0) {
      return;
    }

    const runOrchestration = async function () {
      let projectId: string;
      try {
        const projectService = await SDK.getService<IProjectPageService>(
          CommonServiceIds.ProjectPageService,
        );
        const project = await projectService.getProject();
        if (!project) {
          throw new Error("Could not determine current project.");
        }
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
          permissions,
        );
      } catch (err) {
        setFatalError(`Unexpected error: ${(err as Error).message}`);
      }

      onComplete(stepsRef.current);
      setRunning(false);
      setDone(true);
    };

    void runOrchestration();
  }, [existingResults, onComplete, parameterValues, permissions, template]);

  const hasFailures = steps.some((s) => s.status === "failed");

  const titleText = running
    ? "Scaffolding in progress..."
    : done && !hasFailures
      ? "Scaffold complete!"
      : "Scaffold finished with issues";

  return { steps, running, done, fatalError, hasFailures, titleText };
}
