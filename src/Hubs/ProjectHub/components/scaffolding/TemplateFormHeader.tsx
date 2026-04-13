import React from "react";
import { TemplateDefinition } from "../../../../types/templateTypes";
import { ScaffoldNote } from "../../../../components/ScaffoldNote";

interface TemplateFormHeaderProps {
  template: TemplateDefinition;
  values: Record<string, unknown>;
}

export function TemplateFormHeader({ template, values }: TemplateFormHeaderProps) {
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
            <ScaffoldNote key={i} note={note} values={values} />
          ))}
        </div>
      )}
    </>
  );
}
