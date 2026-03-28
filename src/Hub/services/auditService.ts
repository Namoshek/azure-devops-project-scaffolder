import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IExtensionDataManager,
  IExtensionDataService,
} from "azure-devops-extension-api";
import { TemplateDefinition } from "../types/templateTypes";
import { AuditRecord } from "../types/auditTypes";

const AUDIT_COLLECTION = "scaffoldingAudit";

/**
 * Module-level cache, same pattern as extensionSettingsService. Populated on
 * the first call and reused for the lifetime of the page.
 */
let managerPromise: Promise<IExtensionDataManager> | null = null;

async function getManager(): Promise<IExtensionDataManager> {
  if (!managerPromise) {
    managerPromise = (async () => {
      const dataService = await SDK.getService<IExtensionDataService>(
        CommonServiceIds.ExtensionDataService,
      );
      const accessToken = await SDK.getAccessToken();
      return dataService.getExtensionDataManager(
        SDK.getExtensionContext().id,
        accessToken,
      );
    })().catch((err) => {
      managerPromise = null;
      throw err;
    });
  }
  return managerPromise;
}

/**
 * Returns a copy of parameterValues where every parameter declared as
 * `secret: true` in the template has its value replaced with "[redacted]".
 * This ensures sensitive values are never persisted in the audit log.
 */
export function redactSecretParams(
  template: TemplateDefinition,
  parameterValues: Record<string, unknown>,
): Record<string, unknown> {
  const secretIds = new Set(
    template.parameters.filter((p) => p.secret === true).map((p) => p.id),
  );
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameterValues)) {
    result[key] = secretIds.has(key) ? "[redacted]" : value;
  }
  return result;
}

/**
 * Creates a new audit record in the scaffoldingAudit collection. The returned
 * record includes the server-generated `id` which is needed for subsequent
 * updateAuditRecord calls.
 */
export async function createAuditRecord(
  record: Omit<AuditRecord, "id">,
): Promise<AuditRecord> {
  const manager = await getManager();
  const doc = await manager.createDocument(AUDIT_COLLECTION, record);
  return doc as AuditRecord;
}

/**
 * Updates an existing audit record. The record must include the `id` returned
 * by createAuditRecord.
 */
export async function updateAuditRecord(record: AuditRecord): Promise<void> {
  const manager = await getManager();
  await manager.updateDocument(AUDIT_COLLECTION, record);
}

/**
 * Returns all audit records for a specific project, sorted by timestamp
 * descending (most recent first). Fetches all collection-scoped records and
 * filters client-side by projectId. Returns an empty array on error so the
 * UI fails open.
 */
export async function getAuditRecordsForProject(
  projectId: string,
): Promise<AuditRecord[]> {
  try {
    const manager = await getManager();
    const docs = await manager.getDocuments(AUDIT_COLLECTION);
    return (docs as AuditRecord[])
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}

/**
 * Returns all audit records across all projects, sorted by timestamp
 * descending (most recent first). Returns an empty array on error.
 */
export async function getAllAuditRecords(): Promise<AuditRecord[]> {
  try {
    const manager = await getManager();
    const docs = await manager.getDocuments(AUDIT_COLLECTION);
    return (docs as AuditRecord[]).sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
  } catch {
    return [];
  }
}
