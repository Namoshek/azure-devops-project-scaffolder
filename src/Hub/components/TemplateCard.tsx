import React from "react";
import { DiscoveredTemplate } from "../types/templateTypes";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { TitleSize } from "azure-devops-ui/Components/Header/Header.Props";
import { Pill as PillBase } from "azure-devops-ui/Components/Pill/Pill";
import {
  PillSize,
  PillVariant,
} from "azure-devops-ui/Components/Pill/Pill.Props";

const Pill = PillBase as React.ComponentType<
  React.ComponentProps<typeof PillBase> & { children?: React.ReactNode }
>;

export interface TemplateCardProps {
  template: DiscoveredTemplate;
  onSelect?: () => void;
}

export function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const { definition, sourceProjectName, sourceRepoName } = template;

  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      role="button"
      tabIndex={0}
      className="cursor-pointer"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) onSelect();
      }}
    >
      <Card
        titleProps={{ text: definition.name, size: TitleSize.Medium }}
        headerDescriptionProps={{ text: `v${definition.version}` }}
        className="bolt-card-white"
      >
        <div
          className="flex-column rhythm-vertical-8"
          style={{ paddingBottom: 4 }}
        >
          {definition.description && (
            <p className="body-m" style={{ margin: 0 }}>
              {definition.description}
            </p>
          )}
          <p className="secondary-text caption" style={{ marginBottom: 0 }}>
            Source repository: {sourceProjectName} / {sourceRepoName}
          </p>
          {definition.maintainers && definition.maintainers.length > 0 && (
            <p className="secondary-text caption" style={{ marginTop: 0 }}>
              Maintained by: {definition.maintainers.join(", ")}
            </p>
          )}
          {((definition.repositories && definition.repositories.length > 0) ||
            (definition.pipelines && definition.pipelines.length > 0)) && (
            <div className="flex-row flex-wrap rhythm-horizontal-8">
              {definition.repositories &&
                definition.repositories.length > 0 && (
                  <Pill size={PillSize.compact} variant={PillVariant.outlined}>
                    {definition.repositories.length} repo(s)
                  </Pill>
                )}
              {definition.pipelines && definition.pipelines.length > 0 && (
                <Pill size={PillSize.compact} variant={PillVariant.outlined}>
                  {definition.pipelines.length} pipeline(s)
                </Pill>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
