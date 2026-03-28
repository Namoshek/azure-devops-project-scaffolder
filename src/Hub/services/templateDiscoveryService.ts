import * as SDK from "azure-devops-extension-sdk";
import { DiscoveredTemplate } from "../types/templateTypes";
import { readTemplateFromRepo } from "./templateReaderService";
import { getRestrictedProjects } from "./extensionSettingsService";
import { getSearchServiceUrl } from "./locationService";

interface CodeSearchResult {
  fileName: string;
  path: string;
  project: { id: string; name: string };
  repository: { id: string; name: string };
}

interface CodeSearchResponse {
  count: number;
  results: CodeSearchResult[];
}

/**
 * Module-level cache for the in-flight / completed discovery promise.
 * Populated on the first call to discoverTemplates() and reused for
 * subsequent calls within the same page lifetime. Because the module is
 * re-evaluated on every fresh extension load, the cache is always empty
 * when the extension is first opened.
 */
let cachedDiscovery: Promise<DiscoveredTemplate[]> | null = null;

/**
 * Discovers all project-template.yml files across the collection using the
 * Code Search extension REST API.
 *
 * Results are cached for the lifetime of the current page so navigating
 * back from the parameter form does not trigger a redundant re-fetch.
 * Throws a descriptive error if the Code Search extension is not installed.
 */
export function discoverTemplates(): Promise<DiscoveredTemplate[]> {
  if (cachedDiscovery !== null) {
    return cachedDiscovery;
  }
  cachedDiscovery = fetchTemplates().catch((err) => {
    // Clear the cache so a retry is possible if the fetch failed.
    cachedDiscovery = null;
    throw err;
  });
  return cachedDiscovery;
}

async function fetchTemplates(): Promise<DiscoveredTemplate[]> {
  const accessToken = await SDK.getAccessToken();
  // On Azure DevOps Services (cloud) the Code Search service is hosted at a
  // separate resource area URL; getSearchServiceUrl() resolves it via
  // ILocationService and falls back to the collection URL on-prem.
  const searchBaseUrl = await getSearchServiceUrl();

  // Check whether a collection admin has restricted discovery to specific
  // projects. Errors are swallowed inside getRestrictedProjects() and treated
  // as "no restriction" so discovery still works for regular users.
  const restrictions = await getRestrictedProjects();

  // Code Search API: POST /_apis/search/codesearchresults
  const searchUrl = `${searchBaseUrl}/_apis/search/codesearchresults?api-version=7.0`;

  const body = {
    searchText: "file:project-template.yml",
    $skip: 0,
    $top: 200,
    filters: restrictions.length > 0 ? { Project: restrictions.map((r) => r.name) } : {},
    $orderBy: null,
    includeFacets: false,
  };

  let response: Response;
  try {
    response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Failed to reach the Code Search API. Ensure the Code Search extension is installed on this Azure DevOps Server instance.",
    );
  }

  if (response.status === 404) {
    throw new Error(
      "Code Search extension is not installed. Please install the 'Code Search' extension from the Extension Manager and try again.",
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Code Search API error (${response.status}): ${text}`);
  }

  const data: CodeSearchResponse = await response.json();

  if (!data.results || data.results.length === 0) {
    return [];
  }

  // Deduplicate by repo — take the first hit per repo (there should only be one
  // project-template.yml per repo at the root, but search may return multiple paths)
  const seen = new Set<string>();
  const unique = data.results.filter((r) => {
    const key = `${r.project.id}/${r.repository.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const results: DiscoveredTemplate[] = [];

  for (const hit of unique) {
    try {
      const definition = await readTemplateFromRepo(hit.project.id, hit.repository.id, hit.path);
      definition._sourceProjectId = hit.project.id;
      definition._sourceProjectName = hit.project.name;
      definition._sourceRepoId = hit.repository.id;
      definition._sourceRepoName = hit.repository.name;

      results.push({
        definition,
        sourceProjectName: hit.project.name,
        sourceRepoName: hit.repository.name,
      });
    } catch (err) {
      // Skip malformed templates; log to console so authors can diagnose
      console.warn(`Skipping template in ${hit.project.name}/${hit.repository.name}: ${(err as Error).message}`);
    }
  }

  return results;
}
