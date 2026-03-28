import React from "react";
import { Table, ITableColumn, SimpleTableCell, TwoLineTableCell } from "azure-devops-ui/Table";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { Tooltip as TooltipBase } from "azure-devops-ui/TooltipEx";
import { AuditRecord } from "../types/auditTypes";
import { statusColors } from "../types/statusColors";

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
  if (entries.length === 0) return null;
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

function formatParamsLabel(params: Record<string, unknown>): string {
  const count = Object.keys(params).length;
  return count === 0 ? "None" : `${count} parameter${count === 1 ? "" : "s"}`;
}

function buildColumns(showProjectColumn: boolean): ITableColumn<AuditRecord>[] {
  const columns: ITableColumn<AuditRecord>[] = [];

  if (showProjectColumn) {
    columns.push({
      id: "project",
      name: "Project",
      width: -20,
      renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
        <SimpleTableCell key={`proj-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
          <span className="text-ellipsis">{item.projectName}</span>
        </SimpleTableCell>
      ),
    });
  }

  columns.push(
    {
      id: "timestamp",
      name: "Date/Time",
      width: showProjectColumn ? -12 : -20,
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
      width: showProjectColumn ? -15 : -20,
      renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
        <SimpleTableCell key={`usr-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
          <span className="text-ellipsis">{item.userDisplayName}</span>
        </SimpleTableCell>
      ),
    },
    {
      id: "status",
      name: "Status",
      width: showProjectColumn ? -8 : -10,
      renderCell: (_rowIndex, columnIndex, tableColumn, item) => (
        <SimpleTableCell key={`st-${columnIndex}`} columnIndex={columnIndex} tableColumn={tableColumn}>
          <span style={statusStyle(item.status)}>{statusText(item.status)}</span>
        </SimpleTableCell>
      ),
    },
    {
      id: "params",
      name: "Parameters",
      width: showProjectColumn ? -10 : -15,
      renderCell: (_rowIndex, columnIndex, tableColumn, item) => {
        const tooltipContent = renderParamsTooltip(item.parameterValues);
        const tooltipLabel = formatParamsLabel(item.parameterValues);
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
  );

  return columns;
}

export interface AuditTableProps {
  records: AuditRecord[];
  showProjectColumn?: boolean;
  ariaLabel?: string;
}

export function AuditTable({ records, showProjectColumn = false, ariaLabel = "Scaffolding audit" }: AuditTableProps) {
  const columns = React.useMemo(() => buildColumns(showProjectColumn), [showProjectColumn]);
  const itemProvider = React.useMemo(() => new ArrayItemProvider(records), [records]);

  return <Table<AuditRecord> ariaLabel={ariaLabel} columns={columns} itemProvider={itemProvider} />;
}
