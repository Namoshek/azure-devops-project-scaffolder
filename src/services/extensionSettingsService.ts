import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IExtensionDataManager, IExtensionDataService } from "azure-devops-extension-api";

/**
 * A project to which template discovery may be restricted, stored as
 * collection-scoped extension data. Both id and name are persisted so the
 * Code Search filter (which requires a project name) can be applied without
 * an extra lookup at discovery time.
 */
export interface RestrictedProject {
  id: string;
  name: string;
}

const RESTRICTED_PROJECTS_KEY = "restrictedProjects";
const TEMPLATE_CATEGORIES_KEY = "templateCategories";

interface RestrictedProjectsWrapper {
  projects: RestrictedProject[];
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
      const dataService = await SDK.getService<IExtensionDataService>(CommonServiceIds.ExtensionDataService);
      const accessToken = await SDK.getAccessToken();
      // getExtensionContext().id is the full "publisher.extensionId" string
      // required by getExtensionDataManager.
      return dataService.getExtensionDataManager(SDK.getExtensionContext().id, accessToken);
    })().catch((err) => {
      // Clear the cache so a retry is possible on the next call.
      managerPromise = null;
      throw err;
    });
  }
  return managerPromise;
}

/**
 * Returns the list of projects to which template discovery is restricted.
 * An empty array means no restriction — templates are discovered across the
 * entire collection. Errors are swallowed and treated as "no restriction" to
 * fail open.
 */
export async function getRestrictedProjects(): Promise<RestrictedProject[]> {
  try {
    const manager = await getManager();
    const wrapper = await manager.getValue<RestrictedProjectsWrapper | null>(RESTRICTED_PROJECTS_KEY, {
      defaultValue: null,
    });
    return wrapper?.projects ?? [];
  } catch (err) {
    console.error("Failed to load restricted projects setting:", err);
    return [];
  }
}

/**
 * Persists the list of restricted projects at collection scope. Pass an empty
 * array to clear the restriction (enable full-collection discovery). Throws on
 * failure so the settings UI can surface an appropriate error message.
 */
export async function setRestrictedProjects(projects: RestrictedProject[]): Promise<void> {
  const manager = await getManager();
  await manager.setValue<RestrictedProjectsWrapper>(RESTRICTED_PROJECTS_KEY, {
    projects,
  });
}

/**
 * Returns the configured template categories in admin-defined order, or an empty
 * array if none have been saved yet. Errors are swallowed and treated as
 * "no categories" so the hub fails open (everything lands in "Others").
 */
export async function getTemplateCategories(): Promise<string[]> {
  try {
    const manager = await getManager();
    const wrapper = await manager.getValue<TemplateCategoriesWrapper | null>(TEMPLATE_CATEGORIES_KEY, {
      defaultValue: null,
    });
    return wrapper?.categories ?? [];
  } catch (err) {
    console.error("Failed to load template categories setting:", err);
    return [];
  }
}

/**
 * Persists the ordered list of template categories at collection scope.
 * Pass an empty array to clear all configured categories.
 * Throws on failure so the settings UI can surface an appropriate error.
 */
export async function setTemplateCategories(categories: string[]): Promise<void> {
  const manager = await getManager();
  await manager.setValue<TemplateCategoriesWrapper>(TEMPLATE_CATEGORIES_KEY, {
    categories,
  });
}
