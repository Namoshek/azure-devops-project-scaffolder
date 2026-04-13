import React from "react";
import { DiscoveredTemplate, TemplatePermissions } from "../../../../types/templateTypes";
import { ScaffoldResult } from "../../../../services/scaffoldingOrchestrator";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { TitleSize } from "azure-devops-ui/Components/Header/Header.Props";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { StepRow } from "./StepRow";
import { ScaffoldNote } from "../../../../components/ScaffoldNote";
import { useScaffoldExecution } from "../../hooks/useScaffoldExecution";

const STEP_GROUPS = [
  { type: "repo", title: "Repositories" },
  { type: "serviceconnection", title: "Service Connections" },
  { type: "variablegroup", title: "Variable Groups" },
  { type: "pipeline", title: "Pipelines" },
] as const;

interface ScaffoldProgressProps {
  template: DiscoveredTemplate;
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
          Template: <strong>{template.definition.name}</strong>
        </p>
      </div>

      {fatalError && (
        <MessageCard severity={MessageCardSeverity.Error}>
          <strong>Fatal error</strong>
          <p style={{ margin: "8px 0 0" }}>{fatalError}</p>
        </MessageCard>
      )}

      <div className="flex-column rhythm-vertical-8">
        {STEP_GROUPS.map((group) => ({
          ...group,
          steps: steps.filter((s) => s.id.startsWith(`${group.type}:`)),
        }))
          .filter((group) => group.steps.length > 0)
          .map((group) => (
            <Card
              key={group.type}
              titleProps={{ text: group.title, size: TitleSize.Small }}
              contentProps={{ contentPadding: false }}
            >
              <div>
                {group.steps.map((step, idx) => (
                  <StepRow key={step.id} step={step} isLast={idx === group.steps.length - 1} />
                ))}
              </div>
            </Card>
          ))}
      </div>

      {done &&
        !hasFailures &&
        template.definition.postScaffoldNotes &&
        template.definition.postScaffoldNotes.length > 0 && (
          <div className="flex-column rhythm-vertical-8">
            {template.definition.postScaffoldNotes.map((note, i) => (
              <ScaffoldNote key={i} note={note} values={parameterValues} />
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
