import { useState, useEffect, useRef } from "react";
import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { DiscoveredTemplate, TemplatePermissions } from "../../../types/templateTypes";
import { runScaffold, ScaffoldResult, ScaffoldStep } from "../../../services/scaffoldingOrchestrator";
import { AuditRecord } from "../../../types/auditTypes";
import { createAuditRecord, updateAuditRecord, redactSecretParams } from "../../../services/auditService";

export interface UseScaffoldExecutionResult {
  steps: ScaffoldStep[];
  running: boolean;
  done: boolean;
  fatalError: string | null;
  hasFailures: boolean;
  titleText: string;
}

export function useScaffoldExecution(
  template: DiscoveredTemplate,
  parameterValues: Record<string, unknown>,
  permissions: TemplatePermissions,
  existingResults: ScaffoldResult[],
  onComplete: (results: ScaffoldResult[]) => void,
): UseScaffoldExecutionResult {
  const [steps, setSteps] = useState<ScaffoldStep[]>(existingResults.length > 0 ? existingResults : []);
  const [running, setRunning] = useState(existingResults.length === 0);
  const [done, setDone] = useState(existingResults.length > 0);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const stepsRef = useRef<ScaffoldStep[]>(steps);
  const auditRecordRef = useRef<AuditRecord | null>(null);

  useEffect(() => {
    if (existingResults.length > 0) {
      return;
    }

    const runOrchestration = async function () {
      let projectId: string;
      let projectName: string;
      try {
        const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
        const project = await projectService.getProject();
        if (!project) {
          throw new Error("Could not determine current project.");
        }
        projectId = project.id;
        projectName = project.name;
      } catch (err) {
        setRunning(false);
        setDone(true);
        setFatalError(`Failed to determine current project: ${(err as Error).message}`);
        return;
      }

      const user = SDK.getUser();
      // Create an audit record with "inProgress" status before scaffolding
      // starts. Audit errors must not block or affect the scaffolding process.
      try {
        auditRecordRef.current = await createAuditRecord({
          timestamp: new Date().toISOString(),
          projectId,
          projectName,
          templateId: template.definition.id,
          templateName: template.definition.name,
          templateSourceProject: template.sourceProjectName,
          userId: user.id,
          userDisplayName: user.displayName,
          parameterValues: redactSecretParams(template.definition, parameterValues),
          status: "inProgress",
        });
      } catch (auditErr) {
        console.warn("Failed to create audit record:", auditErr);
      }

      let runFailed = false;
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
        runFailed = true;
        setFatalError(`Unexpected error: ${(err as Error).message}`);
      }

      // Update the audit record with the final outcome.
      if (auditRecordRef.current) {
        const finalSteps = stepsRef.current;
        const failed = runFailed || finalSteps.some((s) => s.status === "failed");
        updateAuditRecord({
          ...auditRecordRef.current,
          status: failed ? "failed" : "success",
          steps: finalSteps,
        }).catch((auditErr) => console.warn("Failed to update audit record:", auditErr));
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
