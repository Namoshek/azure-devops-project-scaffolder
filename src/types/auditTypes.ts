/**
 * Lifecycle status of a scaffolding run stored in the audit log.
 * - `"inProgress"` — scaffolding has started but not yet completed.
 * - `"success"` — all steps finished without errors.
 * - `"failed"` — one or more steps encountered an error and scaffolding did not complete.
 */
export type AuditStatus = "inProgress" | "success" | "failed";

export interface AuditStepResult {
  /** Stable identifier for the step, e.g. `"repo-myrepo"` or `"pipeline-myci"`. */
  id: string;
  /** Human-readable step description shown in the audit detail view, e.g. `"Create repository myrepo"`. */
  label: string;
  /**
   * Outcome of the step as recorded by the scaffolding orchestrator.
   * Typical values are `"success"`, `"skipped"`, and `"failed"`.
   */
  status: string;
  /** Optional additional context for the step result — typically an error message when `status` is `"failed"`. */
  detail?: string;
}

export interface AuditRecord {
  /** Server-generated document id, populated after createDocument returns. */
  id: string;
  /** ISO-8601 timestamp of when scaffolding was started. */
  timestamp: string;
  /** ADO project ID of the project being scaffolded into. */
  projectId: string;
  /** Display name of the ADO project being scaffolded into. */
  projectName: string;
  /** Stable GUID of the template used, as declared in the template's `id` field. */
  templateId: string;
  /** Display name of the template used, as declared in the template's `name` field. */
  templateName: string;
  /** Display name of the ADO project that hosts the template repository. */
  templateSourceProject: string;
  /** ADO project ID of the project that hosts the template repository. */
  templateSourceProjectId?: string;
  /** Repository ID of the Git repository containing the template file. */
  templateSourceRepoId?: string;
  /** Name of the Git repository containing the template file. */
  templateSourceRepoName?: string;
  /** Git commit SHA of the template file at the time scaffolding was triggered. */
  templateCommitId?: string;
  /** ADO object ID of the user who triggered the scaffolding run. */
  userId: string;
  /** Friendly display name of the user who triggered the scaffolding run, e.g. `"Jane Smith"`. */
  userDisplayName: string;
  /** Parameter values with secret params replaced by "[redacted]". */
  parameterValues: Record<string, unknown>;
  /** Overall status of the scaffolding run. Updated to `"success"` or `"failed"` once the run completes. */
  status: AuditStatus;
  /** Final step results, populated once scaffolding completes. */
  steps?: AuditStepResult[];
}
