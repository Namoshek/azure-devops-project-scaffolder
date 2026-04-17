import React from "react";
import { TemplateDefinition } from "../../../../types/templateTypes";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { TitleSize } from "azure-devops-ui/Components/Header/Header.Props";

export interface TemplateInfoProps {
  template: TemplateDefinition;
}

export function TemplateInfo({ template }: TemplateInfoProps) {
  return (
    <div>
      <Card
        titleProps={{ text: `Selected Template: ${template.name}`, size: TitleSize.Large }}
        headerDescriptionProps={{ text: `v${template.version}` }}
        className="bolt-card-white padding-vertical-0"
      >
        <div className="flex-column rhythm-vertical-8" style={{ paddingBottom: 4 }}>
          {template.description && (
            <p className="body-m" style={{ marginTop: 4, marginBottom: 12 }}>
              {template.description}
            </p>
          )}
          {template.maintainers && template.maintainers.length > 0 && (
            <p className="secondary-text caption" style={{ marginTop: 0 }}>
              Maintained by: {template.maintainers.join(", ")}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
