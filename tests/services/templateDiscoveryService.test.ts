// Discovery service has module-level state (cache), so each test resets modules
// and loads a fresh instance via doMock + require.

import type { DiscoveredTemplate } from "../../src/types/templateTypes";
import type { RestrictedProject } from "../../src/services/extensionSettingsService";

// On cloud, Code Search is served from a separate resource area host.
const SEARCH_URL = "https://almsearch.dev.azure.com/MyOrg";

// Minimal valid template definition used across tests
const MOCK_DEFINITION = {
  id: "abc",
  name: "Test Template",
  version: "1.0.0",
  parameters: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSearchResponse(results: object[]) {
  return {
    count: results.length,
    results,
  };
}

function makeSearchHit(
  overrides: Partial<{
    fileName: string;
    path: string;
    projectId: string;
    projectName: string;
    repoId: string;
    repoName: string;
  }> = {},
) {
  return {
    fileName: overrides.fileName ?? "project-template.yml",
    path: overrides.path ?? "/project-template.yml",
    project: {
      id: overrides.projectId ?? "proj1",
      name: overrides.projectName ?? "Project One",
    },
    repository: {
      id: overrides.repoId ?? "repo1",
      name: overrides.repoName ?? "Repo One",
    },
  };
}

/** Load a fresh instance of the discovery module with controlled mocks. */
function loadFreshModule(options: {
  fetchResponse?: object | "network-error";
  fetchStatus?: number;
  readTemplateResult?: object | Error;
  collectionUrl?: string;
  restrictions?: RestrictedProject[];
}) {
  const mockReadTemplate = jest.fn();
  if (options.readTemplateResult instanceof Error) {
    mockReadTemplate.mockRejectedValue(options.readTemplateResult);
  } else if (options.readTemplateResult !== undefined) {
    mockReadTemplate.mockResolvedValue(options.readTemplateResult);
  }

  const mockFetch = jest.fn();
  if (options.fetchResponse === "network-error") {
    mockFetch.mockRejectedValue(new Error("Network failure"));
  } else {
    const status = options.fetchStatus ?? 200;
    mockFetch.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(options.fetchResponse ?? { count: 0, results: [] }),
      text: () => Promise.resolve("error text"),
    });
  }
  (global as any).fetch = mockFetch;

  jest.doMock("azure-devops-extension-sdk", () => ({
    getAccessToken: jest.fn().mockResolvedValue("test-token"),
    getHost: jest.fn().mockReturnValue({ name: "MyOrg" }),
  }));

  const mockGetRestrictedProjects = jest.fn().mockResolvedValue(options.restrictions ?? []);
  jest.doMock("../../src/services/extensionSettingsService", () => ({
    getRestrictedProjects: mockGetRestrictedProjects,
  }));

  jest.doMock("../../src/services/locationService", () => ({
    getSearchServiceUrl: jest.fn().mockResolvedValue(options.collectionUrl ?? SEARCH_URL),
  }));

  jest.doMock("../../src/services/templateReaderService", () => ({
    readTemplateFromRepo: mockReadTemplate,
  }));

  const { discoverTemplates } = require("../../src/services/templateDiscoveryService") as {
    discoverTemplates: () => Promise<DiscoveredTemplate[]>;
  };

  return {
    discoverTemplates,
    mockFetch,
    mockReadTemplate,
    mockGetRestrictedProjects,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("discoverTemplates", () => {
  it("returns an empty array when there are no search results", async () => {
    const { discoverTemplates } = loadFreshModule({
      fetchResponse: buildSearchResponse([]),
    });

    const results = await discoverTemplates();
    expect(results).toEqual([]);
  });

  it("posts to the correct Code Search URL with a bearer token", async () => {
    const { discoverTemplates, mockFetch } = loadFreshModule({
      fetchResponse: buildSearchResponse([]),
    });

    await discoverTemplates();

    expect(mockFetch).toHaveBeenCalledWith(
      `${SEARCH_URL}/_apis/search/codesearchresults?api-version=7.0`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("maps a single search result to a DiscoveredTemplate", async () => {
    const { discoverTemplates, mockReadTemplate } = loadFreshModule({
      fetchResponse: buildSearchResponse([makeSearchHit()]),
      readTemplateResult: { ...MOCK_DEFINITION },
    });

    const results = await discoverTemplates();

    expect(results).toHaveLength(1);
    expect(results[0].sourceProjectName).toBe("Project One");
    expect(results[0].sourceRepoName).toBe("Repo One");
    expect(mockReadTemplate).toHaveBeenCalledTimes(1);
  });

  it("sets sourceProjectId/sourceRepoId on the discovered template", async () => {
    const { discoverTemplates } = loadFreshModule({
      fetchResponse: buildSearchResponse([makeSearchHit()]),
      readTemplateResult: { ...MOCK_DEFINITION },
    });

    const results = await discoverTemplates();
    expect(results[0].sourceProjectId).toBe("proj1");
    expect(results[0].sourceRepoId).toBe("repo1");
  });

  it("deduplicates multiple hits from the same repo", async () => {
    const { discoverTemplates, mockReadTemplate } = loadFreshModule({
      fetchResponse: buildSearchResponse([
        makeSearchHit({ path: "/project-template.yml" }),
        makeSearchHit({ path: "/subfolder/project-template.yml" }), // same proj+repo
      ]),
      readTemplateResult: { ...MOCK_DEFINITION },
    });

    const results = await discoverTemplates();

    // Only one unique repo → only one template
    expect(results).toHaveLength(1);
    expect(mockReadTemplate).toHaveBeenCalledTimes(1);
  });

  it("keeps templates from different repos", async () => {
    const { discoverTemplates, mockReadTemplate } = loadFreshModule({
      fetchResponse: buildSearchResponse([
        makeSearchHit({ repoId: "repo1", repoName: "Repo One" }),
        makeSearchHit({ repoId: "repo2", repoName: "Repo Two" }),
      ]),
      readTemplateResult: { ...MOCK_DEFINITION },
    });

    const results = await discoverTemplates();
    expect(results).toHaveLength(2);
    expect(mockReadTemplate).toHaveBeenCalledTimes(2);
  });

  it("skips a template when readTemplateFromRepo throws (logs a warning)", async () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { discoverTemplates } = loadFreshModule({
      fetchResponse: buildSearchResponse([makeSearchHit()]),
      readTemplateResult: new Error("Invalid YAML"),
    });

    const results = await discoverTemplates();

    expect(results).toHaveLength(0);
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it("throws when the Code Search API returns 404", async () => {
    const { discoverTemplates } = loadFreshModule({ fetchStatus: 404 });

    await expect(discoverTemplates()).rejects.toThrow("Code Search extension is not installed");
  });

  it("throws when the Code Search API returns a non-OK status", async () => {
    const { discoverTemplates } = loadFreshModule({ fetchStatus: 500 });

    await expect(discoverTemplates()).rejects.toThrow("Code Search API error (500)");
  });

  it("throws a descriptive error on a network failure", async () => {
    const { discoverTemplates } = loadFreshModule({
      fetchResponse: "network-error",
    });

    await expect(discoverTemplates()).rejects.toThrow("Failed to reach the Code Search API");
  });

  it("caches the result so the API is only called once on repeated invocations", async () => {
    const { discoverTemplates, mockFetch } = loadFreshModule({
      fetchResponse: buildSearchResponse([]),
    });

    await discoverTemplates();
    await discoverTemplates();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("clears the cache after a failed fetch so a retry is possible", async () => {
    // First call – fail
    const { discoverTemplates, mockFetch } = loadFreshModule({
      fetchStatus: 500,
    });

    await expect(discoverTemplates()).rejects.toThrow();

    // Reconfigure fetch on the same module instance to succeed on retry
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(buildSearchResponse([])),
    });

    const results = await discoverTemplates();
    expect(results).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("preserves templateCategories from the parsed definition", async () => {
    const definitionWithCategories = {
      ...MOCK_DEFINITION,
      templateCategories: ["Backend"],
    };
    const { discoverTemplates } = loadFreshModule({
      fetchResponse: buildSearchResponse([makeSearchHit()]),
      readTemplateResult: definitionWithCategories,
    });

    const results = await discoverTemplates();

    expect(results[0].definition.templateCategories).toEqual(["Backend"]);
  });

  it("sends no Project filter when no restrictions are configured", async () => {
    const { discoverTemplates, mockFetch } = loadFreshModule({
      fetchResponse: buildSearchResponse([]),
      restrictions: [],
    });

    await discoverTemplates();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.filters).toEqual({});
  });

  it("sends a Project filter with all restricted project names", async () => {
    const restrictions: RestrictedProject[] = [
      { id: "id-1", name: "Project Alpha" },
      { id: "id-2", name: "Project Beta" },
    ];
    const { discoverTemplates, mockFetch } = loadFreshModule({
      fetchResponse: buildSearchResponse([]),
      restrictions,
    });

    await discoverTemplates();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.filters).toEqual({
      Project: ["Project Alpha", "Project Beta"],
    });
  });

  it("uses the collection URL from LocationService (supports /tfs/ prefix)", async () => {
    const tfsUrl = "https://myserver.contoso.com/tfs/DefaultCollection";
    const { discoverTemplates, mockFetch } = loadFreshModule({
      fetchResponse: buildSearchResponse([]),
      collectionUrl: tfsUrl,
    });

    await discoverTemplates();

    expect(mockFetch).toHaveBeenCalledWith(
      `${tfsUrl}/_apis/search/codesearchresults?api-version=7.0`,
      expect.anything(),
    );
  });
});
