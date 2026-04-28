import React, { useEffect, useState } from "react";
import { DiscoveredTemplate } from "../../../../types/templateTypes";
import { getCollectionUrl } from "../../../../services/locationService";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { TitleSize } from "azure-devops-ui/Components/Header/Header.Props";
import { Pill as PillBase } from "azure-devops-ui/Components/Pill/Pill";
import { PillSize, PillVariant } from "azure-devops-ui/Components/Pill/Pill.Props";

const Pill = PillBase as React.ComponentType<React.ComponentProps<typeof PillBase> & { children?: React.ReactNode }>;

export interface TemplateCardProps {
  template: DiscoveredTemplate;
  onSelect?: () => void;
}

export function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const { definition, sourceProjectName, sourceRepoName } = template;

  const [repoUrl, setRepoUrl] = useState<string | null>(null);

  useEffect(() => {
    getCollectionUrl().then((base) => {
      setRepoUrl(`${base}/${encodeURIComponent(sourceProjectName)}/_git/${encodeURIComponent(sourceRepoName)}`);
    });
  }, [sourceProjectName, sourceRepoName]);

  return (
    <div
      role="button"
      tabIndex={0}
      className="cursor-pointer"
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <Card
        titleProps={{ text: definition.name, size: TitleSize.Medium }}
        headerDescriptionProps={{ text: `v${definition.version}` }}
        className="bolt-card-white"
      >
        <div className="flex-column rhythm-vertical-8" style={{ paddingBottom: 4 }}>
          {definition.description && (
            <p className="body-m" style={{ margin: 0 }}>
              {definition.description}
            </p>
          )}
          <p className="secondary-text caption" style={{ marginBottom: 0 }}>
            Source repository:{" "}
            {repoUrl ? (
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {sourceProjectName} / {sourceRepoName}
              </a>
            ) : (
              `${sourceProjectName} / ${sourceRepoName}`
            )}
          </p>
          {definition.maintainers && definition.maintainers.length > 0 && (
            <p className="secondary-text caption" style={{ marginTop: 0 }}>
              Maintained by: {definition.maintainers.join(", ")}
            </p>
          )}
          {(() => {
            const repoCount = definition.scaffoldingSteps.filter((s) => s.type === "repository").length;
            const pipelineCount = definition.scaffoldingSteps.filter((s) => s.type === "pipeline").length;
            const serviceConnectionCount = definition.scaffoldingSteps.filter(
              (s) => s.type === "serviceConnection",
            ).length;
            const variableGroupCount = definition.scaffoldingSteps.filter((s) => s.type === "variableGroup").length;
            const hasPills = repoCount > 0 || pipelineCount > 0 || serviceConnectionCount > 0 || variableGroupCount > 0;
            return hasPills ? (
              <div className="flex-row flex-wrap rhythm-horizontal-8">
                {repoCount > 0 && (
                  <Pill size={PillSize.compact} variant={PillVariant.outlined}>
                    {repoCount} repo(s)
                  </Pill>
                )}
                {pipelineCount > 0 && (
                  <Pill size={PillSize.compact} variant={PillVariant.outlined}>
                    {pipelineCount} pipeline(s)
                  </Pill>
                )}
                {serviceConnectionCount > 0 && (
                  <Pill size={PillSize.compact} variant={PillVariant.outlined}>
                    {serviceConnectionCount} service connection(s)
                  </Pill>
                )}
                {variableGroupCount > 0 && (
                  <Pill size={PillSize.compact} variant={PillVariant.outlined}>
                    {variableGroupCount} variable group(s)
                  </Pill>
                )}
              </div>
            ) : null;
          })()}
        </div>
      </Card>
    </div>
  );
}
