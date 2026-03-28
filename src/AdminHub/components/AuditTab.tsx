import React, { useState, useEffect, useMemo } from "react";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { Table, ITableColumn, SimpleTableCell, TwoLineTableCell } from "azure-devops-ui/Table";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { Tooltip as TooltipBase } from "azure-devops-ui/TooltipEx";
import { AuditRecord } from "../../Hub/types/auditTypes";
import { getAllAuditRecords } from "../../Hub/services/auditService";

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
      return { color: "var(--status-success-foreground)", fontWeight: 600 };
    case "failed":
      return { color: "var(--status-error-foreground)", fontWeight: 600 };
    case "inProgress":
      return { color: "var(--status-info-foreground)", fontWeight: 600 };
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

function paramsLabel(params: Record<string, unknown>): string {
  const count = Object.keys(params).length;
  if (count === 0) return "None";
  return `${count} parameter${count === 1 ? "" : "s"}`;
}

const columns: ITableColumn<AuditRecord>[] = [
  {
    id: "project",
    name: "Project",
    width: -20,
    renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
      <SimpleTableCell key={`proj-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
        <span className="text-ellipsis">{item.projectName}</span>
      </SimpleTableCell>
    ),
  },
  {
    id: "timestamp",
    name: "Date/Time",
    width: -12,
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
    width: -15,
    renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
      <SimpleTableCell key={`usr-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
        <span className="text-ellipsis">{item.userDisplayName}</span>
      </SimpleTableCell>
    ),
  },
  {
    id: "status",
    name: "Status",
    width: -8,
    renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
      <SimpleTableCell key={`st-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
        <span style={statusStyle(item.status)}>{statusText(item.status)}</span>
      </SimpleTableCell>
    ),
  },
  {
    id: "params",
    name: "Parameters",
    width: -10,
    renderCell: (_rowIndex, columnIndex, tableColumn, item) => {
      const tooltipContent = renderParamsTooltip(item.parameterValues);
      const tooltipLabel = paramsLabel(item.parameterValues);
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

export function AuditTab() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAllAuditRecords()
      .then(setRecords)
      .catch((err: Error) => setError(`Failed to load audit records: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  const itemProvider = useMemo(() => new ArrayItemProvider(records), [records]);

  return (
    <Card className="bolt-card-white" titleProps={{ text: "Scaffolding Audit" }}>
      {loading && (
        <div className="flex-row justify-center" style={{ padding: "32px 0" }}>
          <Spinner size={SpinnerSize.large} label="Loading audit records…" />
        </div>
      )}
      {!loading && error && <MessageCard severity={MessageCardSeverity.Error}>{error}</MessageCard>}
      {!loading && !error && records.length === 0 && (
        <p className="secondary-text" style={{ margin: "8px 0" }}>
          No scaffolding operations have been recorded yet.
        </p>
      )}
      {!loading && !error && records.length > 0 && (
        <Table<AuditRecord> ariaLabel="Scaffolding audit" columns={columns} itemProvider={itemProvider} />
      )}
    </Card>
  );
}
