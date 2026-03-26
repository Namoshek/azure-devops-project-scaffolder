import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IExtensionDataManager,
  IExtensionDataService,
} from "azure-devops-extension-api";

/**
 * The project to which template discovery is restricted, stored as collection-
 * scoped extension data. Both id and name are persisted so the Code Search
 * filter (which requires a project name) can be applied without an extra
 * lookup at discovery time.
 */
export interface RestrictedProject {
  id: string;
  name: string;
}

const SETTINGS_KEY = "restrictedProject";
const TEMPLATE_CATEGORIES_KEY = "templateCategories";

/**
 * Internal wrapper stored in extension data. Using a wrapper object ensures
 * that `null` (meaning "no restriction") is never passed directly to
 * `setValue`, which would cause the ADO extension data SDK to throw
 * "Cannot set properties of null (setting '__remoteSerializationSettings')".
 */
interface SettingsWrapper {
  project: RestrictedProject | null;
}

interface TemplateCategoriesWrapper {
  categories: string[];
}

/**
 * Module-level cache for the extension data manager. Populated on the first
 * call to getManager() and reused for the lifetime of the page, matching the
 * same pattern used for the template discovery cache.
 */
let managerPromise: Promise<IExtensionDataManager> | null = null;

async function getManager(): Promise<IExtensionDataManager> {
  if (!managerPromise) {
    managerPromise = (async () => {
      const dataService = await SDK.getService<IExtensionDataService>(
        CommonServiceIds.ExtensionDataService,
      );
      const accessToken = await SDK.getAccessToken();
      // getExtensionContext().id is the full "publisher.extensionId" string
      // required by getExtensionDataManager.
      return dataService.getExtensionDataManager(
        SDK.getExtensionContext().id,
        accessToken,
      );
    })().catch((err) => {
      // Clear the cache so a retry is possible on the next call.
      managerPromise = null;
      throw err;
    });
  }
  return managerPromise;
}

/**
 * Returns the currently configured project restriction, or null if no
 * restriction is set. Errors are swallowed and treated as "no restriction"
 * to fail open (discovery falls back to the full collection).
 */
export async function getRestrictedProject(): Promise<RestrictedProject | null> {
  try {
    const manager = await getManager();
    const wrapper = await manager.getValue<SettingsWrapper | null>(
      SETTINGS_KEY,
      { defaultValue: null },
    );
    return wrapper?.project ?? null;
  } catch {
    return null;
  }
}

/**
 * Persists a project restriction at collection scope. Throws on failure so
 * the settings UI can surface an appropriate error message.
 */
export async function setRestrictedProject(
  id: string,
  name: string,
): Promise<void> {
  const manager = await getManager();
  await manager.setValue<SettingsWrapper>(SETTINGS_KEY, {
    project: { id, name },
  });
}

/**
 * Clears the project restriction. After this call, template discovery will
 * search across the entire collection again. Throws on failure.
 */
export async function clearRestrictedProject(): Promise<void> {
  const manager = await getManager();
  // Store { project: null } rather than null directly — passing null to
  // setValue causes "Cannot set properties of null" in the ADO SDK serializer.
  await manager.setValue<SettingsWrapper>(SETTINGS_KEY, { project: null });
}

/**
 * Returns the configured template categories in admin-defined order, or an empty
 * array if none have been saved yet. Errors are swallowed and treated as
 * "no categories" so the hub fails open (everything lands in "Others").
 */
export async function getTemplateCategories(): Promise<string[]> {
  try {
    const manager = await getManager();
    const wrapper = await manager.getValue<TemplateCategoriesWrapper | null>(
      TEMPLATE_CATEGORIES_KEY,
      { defaultValue: null },
    );
    return wrapper?.categories ?? [];
  } catch {
    return [];
  }
}

/**
 * Persists the ordered list of template categories at collection scope.
 * Pass an empty array to clear all configured categories.
 * Throws on failure so the settings UI can surface an appropriate error.
 */
export async function setTemplateCategories(
  categories: string[],
): Promise<void> {
  const manager = await getManager();
  await manager.setValue<TemplateCategoriesWrapper>(TEMPLATE_CATEGORIES_KEY, {
    categories,
  });
}
