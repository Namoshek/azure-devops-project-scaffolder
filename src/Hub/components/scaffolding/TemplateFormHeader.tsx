import React from "react";
import { TemplateDefinition } from "../../types/templateTypes";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";

interface TemplateFormHeaderProps {
  template: TemplateDefinition;
}

export function TemplateFormHeader({ template }: TemplateFormHeaderProps) {
  return (
    <>
      <div className="flex-row rhythm-horizontal-8" style={{ marginBottom: 24 }}>
        <div>
          <div className="title-m">Selected Template: {template.name}</div>
          {template.description && (
            <p className="body-m secondary-text" style={{ margin: "4px 0 0" }}>
              {template.description}
            </p>
          )}
        </div>
      </div>

      {template.preScaffoldNotes && template.preScaffoldNotes.length > 0 && (
        <div className="flex-column rhythm-vertical-8" style={{ marginBottom: 20 }}>
          {template.preScaffoldNotes.map((note, i) => (
            <MessageCard key={i} severity={MessageCardSeverity.Info}>
              {note.split("\n").map((line, li) => (
                <div key={li} style={{ width: "100%" }}>
                  {line}
                </div>
              ))}
            </MessageCard>
          ))}
        </div>
      )}
    </>
  );
}
