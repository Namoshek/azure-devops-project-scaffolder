import React, { useState, useEffect } from "react";
import { Card } from "azure-devops-ui/Components/Card/Card";
import { Spinner } from "azure-devops-ui/Components/Spinner/Spinner";
import { SpinnerSize } from "azure-devops-ui/Components/Spinner/Spinner.Props";
import { MessageCard } from "azure-devops-ui/Components/MessageCard/MessageCard";
import { MessageCardSeverity } from "azure-devops-ui/Components/MessageCard/MessageCard.Props";
import { AuditRecord } from "../../../types/auditTypes";
import { getAllAuditRecords } from "../../../services/auditService";
import { AuditTable } from "../../../components/AuditTable";
import { getErrorMessage } from "../../../utils/errorUtils";

export function AuditTab() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAllAuditRecords()
      .then(setRecords)
      .catch((err: unknown) => setError(`Failed to load audit records: ${getErrorMessage(err)}`))
      .finally(() => setLoading(false));
  }, []);

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
      {!loading && !error && records.length > 0 && <AuditTable records={records} showProjectColumn />}
    </Card>
  );
}
