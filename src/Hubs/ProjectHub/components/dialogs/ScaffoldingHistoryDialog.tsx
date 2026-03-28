import React, { useState } from "react";
import * as SDK from "azure-devops-extension-sdk";
import { Button } from "azure-devops-ui/Components/Button/Button";
import { Dialog as DialogBase } from "azure-devops-ui/Components/Dialog/Dialog";
import { ContentSize } from "azure-devops-ui/Callout";
import { TitleSize } from "azure-devops-ui/Header";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { AuditRecord } from "../../../../types/auditTypes";
import { getAuditRecordsForProject } from "../../../../services/auditService";
import { AuditTable } from "../../../../components/AuditTable";

const Dialog = DialogBase as React.ComponentType<
  React.ComponentProps<typeof DialogBase> & { children?: React.ReactNode }
>;

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
              <AuditTable records={records} ariaLabel="Scaffolding history" />
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
