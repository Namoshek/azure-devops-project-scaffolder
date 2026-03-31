import React from "react";
import { TemplateDefinition, TemplatePermissions } from "../../../../types/templateTypes";
import { ScaffoldResult } from "../../../../services/scaffoldingOrchestrator";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { StepRow } from "./StepRow";
import { renderTemplatePreview } from "../../../../services/templateEngineService";
import { useScaffoldExecution } from "../../hooks/useScaffoldExecution";

interface ScaffoldProgressProps {
  template: TemplateDefinition;
  parameterValues: Record<string, unknown>;
  permissions: TemplatePermissions;
  results: ScaffoldResult[];
  onComplete: (results: ScaffoldResult[]) => void;
  onScaffoldAgain: () => void;
}

export function ScaffoldProgress({
  template,
  parameterValues,
  permissions,
  results,
  onComplete,
  onScaffoldAgain,
}: ScaffoldProgressProps) {
  const { steps, done, fatalError, hasFailures, titleText } = useScaffoldExecution(
    template,
    parameterValues,
    permissions,
    results,
    onComplete,
  );

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

      {done && !hasFailures && template.postScaffoldNotes && template.postScaffoldNotes.length > 0 && (
        <div className="flex-column rhythm-vertical-8">
          {template.postScaffoldNotes.map((note, i) => (
            <MessageCard key={i} severity={MessageCardSeverity.Info}>
              {renderTemplatePreview(note, parameterValues)
                .split("\n")
                .map((line, li) => (
                  <div key={li} style={{ width: "100%" }}>
                    {line}
                  </div>
                ))}
            </MessageCard>
          ))}
        </div>
      )}

      {done && (
        <div>
          <Button text="Scaffold Another Template" onClick={onScaffoldAgain} />
        </div>
      )}
    </div>
  );
}
