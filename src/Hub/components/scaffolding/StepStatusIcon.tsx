import React, { ReactElement } from "react";
import { ScaffoldStep } from "../../services/scaffoldingOrchestrator";
import { Status, Statuses } from "azure-devops-ui/Components/Status/Status";
import { StatusSize } from "azure-devops-ui/Components/Status/Status.Props";

export function StepStatusIcon({ status }: { status: ScaffoldStep["status"] }): ReactElement {
  const statusMap: Record<ScaffoldStep["status"], ReactElement> = {
    pending: <Status {...Statuses.Waiting} size={StatusSize.m} ariaLabel="Pending" />,
    running: <Status {...Statuses.Running} size={StatusSize.m} ariaLabel="Running" />,
    success: <Status {...Statuses.Success} size={StatusSize.m} ariaLabel="Success" />,
    skipped: <Status {...Statuses.Skipped} size={StatusSize.m} ariaLabel="Skipped" />,
    failed: <Status {...Statuses.Failed} size={StatusSize.m} ariaLabel="Failed" />,
  };
  return statusMap[status];
}
