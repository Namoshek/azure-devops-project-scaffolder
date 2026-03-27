import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  ILocationService,
} from "azure-devops-extension-api/Common/CommonServices";

/**
 * Module-level cache for the collection URL promise. Populated on the first
 * call to getCollectionUrl() and reused for the rest of the page lifetime.
 */
let cachedUrl: Promise<string> | null = null;

/**
 * Resource area ID for the Azure DevOps Code Search service.
 * On cloud (dev.azure.com) this resolves to a separate host
 * (e.g. `https://almsearch.dev.azure.com/MyOrg`).
 * On Azure DevOps Server (on-premises) the resource area is not registered,
 * so the fallback to getCollectionUrl() keeps those deployments working.
 */
const CODE_SEARCH_RESOURCE_AREA_ID = "ea48a0a1-269c-42d8-b8ad-ddc8fcdcf578";

let cachedSearchUrl: Promise<string> | null = null;

/**
 * Returns the full base URL of the current collection / organization,
 * including any virtual-directory prefix (e.g. `/tfs/`) that older
 * on-premises TFS installations may use.
 *
 * Examples of returned values:
 * - Cloud:        `https://dev.azure.com/MyOrg`
 * - Server 2022+: `https://myserver.contoso.com/DefaultCollection`
 * - Old TFS:      `https://myserver.contoso.com/tfs/DefaultCollection`
 *
 * The result is cached for the page lifetime because the collection URL
 * cannot change during a single extension session.
 */
export function getCollectionUrl(): Promise<string> {
  if (cachedUrl !== null) {
    return cachedUrl;
  }
  cachedUrl = resolveCollectionUrl();
  return cachedUrl;
}

async function resolveCollectionUrl(): Promise<string> {
  const locationService = await SDK.getService<ILocationService>(
    CommonServiceIds.LocationService,
  );
  const url = await locationService.getServiceLocation();

  // getServiceLocation() may return a trailing slash; strip it so callers
  // can safely append paths like `/_apis/...`.
  return url.replace(/\/+$/, "");
}

/**
 * Returns the base URL for the Code Search REST API.
 *
 * On Azure DevOps Services (cloud) the Code Search service is hosted under a
 * separate resource area (e.g. `https://almsearch.dev.azure.com/MyOrg`).
 * On Azure DevOps Server (on-premises) the resource area is not registered and
 * this function falls back to the collection URL so on-prem deployments
 * continue to work without any extra configuration.
 *
 * The result is cached for the page lifetime.
 */
export function getSearchServiceUrl(): Promise<string> {
  if (cachedSearchUrl !== null) {
    return cachedSearchUrl;
  }
  cachedSearchUrl = resolveSearchServiceUrl();
  return cachedSearchUrl;
}

async function resolveSearchServiceUrl(): Promise<string> {
  const locationService = await SDK.getService<ILocationService>(
    CommonServiceIds.LocationService,
  );

  let url: string | undefined;
  try {
    url = await locationService.getResourceAreaLocation(
      CODE_SEARCH_RESOURCE_AREA_ID,
    );
  } catch {
    // On-prem Server may throw if the resource area is not registered.
  }

  if (!url) {
    // Fall back to the collection URL for on-prem deployments.
    return getCollectionUrl();
  }

  return url.replace(/\/+$/, "");
}
