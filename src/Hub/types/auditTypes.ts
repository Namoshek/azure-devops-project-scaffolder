export type AuditStatus = "inProgress" | "success" | "failed";

export interface AuditStepResult {
  id: string;
  label: string;
  status: string;
  detail?: string;
}

export interface AuditRecord {
  /** Server-generated document id, populated after createDocument returns. */
  id: string;
  /** ISO-8601 timestamp of when scaffolding was started. */
  timestamp: string;
  projectId: string;
  projectName: string;
  templateId: string;
  templateName: string;
  /** The source project where the template resides. */
  templateSourceProject: string;
  userId: string;
  userDisplayName: string;
  /** Parameter values with secret params replaced by "[redacted]". */
  parameterValues: Record<string, unknown>;
  status: AuditStatus;
  /** Final step results, populated once scaffolding completes. */
  steps?: AuditStepResult[];
}
