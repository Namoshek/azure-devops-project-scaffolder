import React from "react";
import { TemplatePermissions } from "../../types/templateTypes";
import { ParameterSummaryItem } from "../../utils/summaryBuilder";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { TitleSize } from "azure-devops-ui/Header";
import { SummaryResourceRow } from "./SummaryResourceRow";

interface ScaffoldSummaryPanelProps {
  permissions: TemplatePermissions | null;
  summaryItems: ParameterSummaryItem[];
}

export function ScaffoldSummaryPanel({ permissions, summaryItems }: ScaffoldSummaryPanelProps) {
  return (
    <Card className="bolt-card-white" titleProps={{ text: "Summary", size: TitleSize.Medium }}>
      {permissions === null ? (
        <div className="flex-row flex-center" style={{ gap: 8, padding: "8px 0" }}>
          <Spinner size={SpinnerSize.small} />
          <span className="body-s secondary-text">Checking permissions...</span>
        </div>
      ) : (
        <div className="rhythm-vertical-8" style={{ width: "100%" }}>
          {summaryItems.map((item, index) => (
            <SummaryResourceRow key={index} item={item} isLast={index === summaryItems.length - 1} />
          ))}
        </div>
      )}
    </Card>
  );
}
