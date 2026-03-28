import React, { useState, useMemo } from "react";
import * as SDK from "azure-devops-extension-sdk";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Dialog as DialogBase } from "azure-devops-ui/Components/Dialog/Dialog";
import { ContentSize } from "azure-devops-ui/Callout";
import { TitleSize } from "azure-devops-ui/Header";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Table, ITableColumn, SimpleTableCell, TwoLineTableCell } from "azure-devops-ui/Table";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { Tooltip as TooltipBase } from "azure-devops-ui/TooltipEx";
import { AuditRecord } from "../../types/auditTypes";
import { getAuditRecordsForProject } from "../../services/auditService";
import { statusColors } from "../../../statusColors";

const Dialog = DialogBase as React.ComponentType<
  React.ComponentProps<typeof DialogBase> & { children?: React.ReactNode }
>;

const Tooltip = TooltipBase as React.ComponentType<
  React.ComponentProps<typeof TooltipBase> & { children?: React.ReactNode }
>;

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case "success":
      return { color: statusColors.success, fontWeight: 600 };
    case "failed":
      return { color: statusColors.error, fontWeight: 600 };
    case "inProgress":
      return { color: statusColors.info, fontWeight: 600 };
    default:
      return { fontWeight: 600 };
  }
}

function statusText(status: string): string {
  switch (status) {
    case "success":
      return "Success";
    case "failed":
      return "Failed";
    case "inProgress":
      return "In Progress";
    default:
      return status;
  }
}

function renderParamsTooltip(params: Record<string, unknown>): React.ReactNode {
  const entries = Object.entries(params);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div>
      {entries.map(([k, v]) => (
        <div key={k}>
          <strong>{k}:</strong> {String(v)}
        </div>
      ))}
    </div>
  );
}

function buildParametersTooltipLabel(params: Record<string, unknown>): string {
  const count = Object.keys(params).length;
  return count === 0 ? "None" : `${count} parameter${count === 1 ? "" : "s"}`;
}

const columns: ITableColumn<AuditRecord>[] = [
  {
    id: "timestamp",
    name: "Date/Time",
    width: -20,
    renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
      <SimpleTableCell key={`ts-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
        <span className="text-ellipsis">{formatTimestamp(item.timestamp)}</span>
      </SimpleTableCell>
    ),
  },
  {
    id: "template",
    name: "Template",
    width: -35,
    renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
      <TwoLineTableCell
        key={`tpl-${columnIndex}`}
        columnIndex={columnIndex}
        tableColumn={tableColumn}
        line1={<span className="primary-text text-ellipsis">{item.templateName}</span>}
        line2={<span className="secondary-text text-ellipsis">{item.templateSourceProject}</span>}
      />
    ),
  },
  {
    id: "user",
    name: "User",
    width: -20,
    renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
      <SimpleTableCell key={`usr-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
        <span className="text-ellipsis">{item.userDisplayName}</span>
      </SimpleTableCell>
    ),
  },
  {
    id: "status",
    name: "Status",
    width: -10,
    renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
      <SimpleTableCell key={`st-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
        <span style={statusStyle(item.status)}>{statusText(item.status)}</span>
      </SimpleTableCell>
    ),
  },
  {
    id: "params",
    name: "Parameters",
    width: -15,
    renderCell: (_rowIndex, columnIndex, tableColumn, item) => {
      const tooltipContent = renderParamsTooltip(item.parameterValues);
      const tooltipLabel = buildParametersTooltipLabel(item.parameterValues);
      return (
        <SimpleTableCell key={`prm-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
          {tooltipContent ? (
            <Tooltip renderContent={() => tooltipContent}>
              <span
                className="text-ellipsis"
                style={{
                  cursor: "help",
                  textDecoration: "underline",
                  textDecorationStyle: "dashed",
                  textUnderlineOffset: 3,
                }}
              >
                {tooltipLabel}
              </span>
            </Tooltip>
          ) : (
            <span className="text-ellipsis">{tooltipLabel}</span>
          )}
        </SimpleTableCell>
      );
    },
  },
];

export function ScaffoldingHistoryDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const projectId = SDK.getWebContext().project.id;
      const data = await getAuditRecordsForProject(projectId);
      setRecords(data);
    } catch (err) {
      setError(`Failed to load scaffolding history: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const itemProvider = useMemo(() => new ArrayItemProvider(records), [records]);

  return (
    <>
      <Button
        text="Scaffolding History"
        iconProps={{ iconName: "History" }}
        subtle={true}
        onClick={() => void handleOpen()}
      />

      {open && (
        <Dialog
          titleProps={{ text: "Scaffolding History", size: TitleSize.Large }}
          showCloseButton
          onDismiss={() => setOpen(false)}
          contentSize={ContentSize.ExtraLarge}
        >
          <div style={{ minWidth: 680 }}>
            {loading && (
              <div className="flex-row justify-center" style={{ padding: "32px 0" }}>
                <Spinner size={SpinnerSize.large} label="Loading history…" />
              </div>
            )}
            {!loading && error && <MessageCard severity={MessageCardSeverity.Error}>{error}</MessageCard>}
            {!loading && !error && records.length === 0 && (
              <p className="secondary-text" style={{ margin: "16px 0" }}>
                No scaffolding operations have been recorded for this project yet.
              </p>
            )}
            {!loading && !error && records.length > 0 && (
              <Table<AuditRecord> ariaLabel="Scaffolding history" columns={columns} itemProvider={itemProvider} />
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
