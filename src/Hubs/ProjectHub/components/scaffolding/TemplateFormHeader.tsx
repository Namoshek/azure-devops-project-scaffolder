import React from "react";
import { TemplateDefinition } from "../../../../types/templateTypes";
import { ScaffoldNote } from "../../../../components/ScaffoldNote";
import { TemplateInfo } from "./TemplateInfo";

interface TemplateFormHeaderProps {
  template: TemplateDefinition;
  values: Record<string, unknown>;
}

export function TemplateFormHeader({ template, values }: TemplateFormHeaderProps) {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <TemplateInfo template={template} />
      </div>

      {template.preScaffoldNotes && template.preScaffoldNotes.length > 0 && (
        <div className="flex-column rhythm-vertical-8" style={{ marginBottom: 40 }}>
          {template.preScaffoldNotes.map((note, i) => (
            <ScaffoldNote key={i} note={note} values={values} />
          ))}
        </div>
      )}
    </>
  );
}
