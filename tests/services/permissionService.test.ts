import {
  checkRepoPermission,
  checkPipelinePermission,
  checkServiceConnectionPermission,
  checkTemplatePermissions,
  checkCollectionAdminPermission,
} from "../../src/services/permissionService";
import type { TemplateDefinition } from "../../src/types/templateTypes";

// --- Mocks -------------------------------------------------------------------

jest.mock("azure-devops-extension-sdk", () => ({
  getAccessToken: jest.fn(),
  getHost: jest.fn(),
}));

jest.mock("../../src/services/locationService", () => ({
  getCollectionUrl: jest.fn(),
}));

import * as SDK from "azure-devops-extension-sdk";
import { getCollectionUrl } from "../../src/services/locationService";

const mockGetAccessToken = SDK.getAccessToken as jest.Mock;
const mockGetHost = SDK.getHost as jest.Mock;
const mockGetCollectionUrl = getCollectionUrl as jest.Mock;

// --- Constants ---------------------------------------------------------------

const COLLECTION_URL = "https://myserver.contoso.com/DefaultCollection";
const TFS_COLLECTION_URL = "https://myserver.contoso.com/tfs/DefaultCollection";
const CLOUD_COLLECTION_URL = "https://dev.azure.com/MyOrg";
const PROJECT_ID = "proj-id-123";

// --- Helpers -----------------------------------------------------------------

function makeBatchResponse(values: boolean[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ evaluations: values.map((value) => ({ value })) }),
  };
}

/**
 * Creates a mock fetch that returns responses in sequence.
 * The last response is repeated for any additional calls.
 */
function mockFetchSequence(
  ...responses: Array<{
    ok: boolean;
    json?: () => Promise<unknown>;
    status?: number;
  }>
) {
  let call = 0;
  return jest.fn().mockImplementation(() => {
    const resp = responses[Math.min(call++, responses.length - 1)];
    return Promise.resolve(resp);
  });
}

/** Configure mocks for an on-premises environment. */
function setupOnPrem(collectionUrl = COLLECTION_URL) {
  mockGetHost.mockReturnValue({ name: "DefaultCollection", isHosted: false });
  mockGetCollectionUrl.mockResolvedValue(collectionUrl);
}

/** Configure mocks for a cloud environment. */
function setupCloud() {
  mockGetHost.mockReturnValue({ name: "MyOrg", isHosted: true });
  mockGetCollectionUrl.mockResolvedValue(CLOUD_COLLECTION_URL);
}

function makeTemplate(overrides: Partial<TemplateDefinition> = {}): TemplateDefinition {
  return {
    id: "tpl-1",
    name: "Test Template",
    version: "1.0.0",
    parameters: [],
    repositories: [{ name: "my-repo", sourcePath: "src", defaultBranch: "main" }],
    pipelines: [
      {
        name: "my-pipeline",
        repository: "my-repo",
        yamlPath: "azure-pipelines.yml",
      },
    ],
    serviceConnections: [],
    variableGroups: [],
    ...overrides,
  };
}

// --- Setup -------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessToken.mockResolvedValue("mock-token");
});

// =============================================================================
// On-premises
// =============================================================================

describe("On-premises", () => {
  beforeEach(() => {
    setupOnPrem();
  });

  // --- checkRepoPermission -------------------------------------------------

  describe("checkRepoPermission", () => {
    it("returns true when batch API grants the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true]));
      expect(await checkRepoPermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when batch API denies the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([false]));
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on non-ok response (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence({ ok: false, status: 403 });
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on network error (fail-closed)", async () => {
      (global as any).fetch = jest.fn().mockRejectedValue(new Error("Network down"));
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("calls permissionevaluationbatch with correct namespace, token and permission bits", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      await checkRepoPermission(PROJECT_ID);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${COLLECTION_URL}/_apis/security/permissionevaluationbatch?api-version=7.0`);
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe("Bearer mock-token");
      expect(JSON.parse(options.body).evaluations).toEqual([
        expect.objectContaining({
          securityNamespaceId: "2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87",
          token: `repoV2/${PROJECT_ID}`,
          permissions: 260,
        }),
      ]);
    });

    it("does not call the resource areas endpoint for on-premises", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      await checkRepoPermission(PROJECT_ID);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).not.toContain("resourceAreas");
    });
  });

  // --- checkPipelinePermission ---------------------------------------------

  describe("checkPipelinePermission", () => {
    it("returns true when batch API grants the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true]));
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when batch API denies the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([false]));
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on non-ok response (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence({ ok: false, status: 500 });
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on network error (fail-closed)", async () => {
      (global as any).fetch = jest.fn().mockRejectedValue(new Error("Network down"));
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
    });

    it("calls permissionevaluationbatch with correct namespace, token and permission bits", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      await checkPipelinePermission(PROJECT_ID);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${COLLECTION_URL}/_apis/security/permissionevaluationbatch?api-version=7.0`);
      expect(JSON.parse(options.body).evaluations).toEqual([
        expect.objectContaining({
          securityNamespaceId: "33344d9c-fc72-4d6f-aba5-fa317101a7e9",
          token: PROJECT_ID,
          permissions: 2048,
        }),
      ]);
    });
  });

  // --- checkTemplatePermissions --------------------------------------------

  describe("checkTemplatePermissions", () => {
    it("returns both true when batch grants both permissions", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true, true]));
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result).toEqual({
        canCreateRepos: true,
        canCreatePipelines: true,
        canCreateServiceConnections: true,
        canCreateVariableGroups: true,
      });
    });

    it("returns canCreateRepos:false when repo result is false", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([false, true]));
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result.canCreateRepos).toBe(false);
      expect(result.canCreatePipelines).toBe(true);
    });

    it("returns canCreatePipelines:false when pipeline result is false", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true, false]));
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result.canCreateRepos).toBe(true);
      expect(result.canCreatePipelines).toBe(false);
    });

    it("sends a single batch request for both repo and pipeline checks", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true, true]));
      (global as any).fetch = mockFetch;
      await checkTemplatePermissions(PROJECT_ID, makeTemplate());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).evaluations).toHaveLength(2);
    });

    it("omits the repo evaluation when template has no repositories", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate({ repositories: [] }));
      expect(result.canCreateRepos).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body).evaluations;
      expect(body).toHaveLength(1);
      expect(body[0].securityNamespaceId).toBe("33344d9c-fc72-4d6f-aba5-fa317101a7e9");
    });

    it("omits the pipeline evaluation when template has no pipelines", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate({ pipelines: [] }));
      expect(result.canCreatePipelines).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body).evaluations;
      expect(body).toHaveLength(1);
      expect(body[0].securityNamespaceId).toBe("2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87");
    });

    it("returns all true without any API calls when template needs nothing", async () => {
      const mockFetch = jest.fn();
      (global as any).fetch = mockFetch;
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate({ repositories: [], pipelines: [] }));
      expect(result).toEqual({
        canCreateRepos: true,
        canCreatePipelines: true,
        canCreateServiceConnections: true,
        canCreateVariableGroups: true,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("fails closed (both false) on batch API error", async () => {
      (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result).toEqual({
        canCreateRepos: false,
        canCreatePipelines: false,
        canCreateServiceConnections: true,
        canCreateVariableGroups: true,
      });
    });

    it("includes a service connection evaluation when template has service connections", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true, true, true]));
      (global as any).fetch = mockFetch;
      const template = makeTemplate({
        serviceConnections: [
          {
            name: "azure-prod",
            type: "AzureRM",
            authorizationScheme: "ServicePrincipal",
            authorization: {},
          },
        ],
      });
      const result = await checkTemplatePermissions(PROJECT_ID, template);

      expect(result.canCreateServiceConnections).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body).evaluations;
      // repo + pipeline + service connection = 3 evaluations
      expect(body).toHaveLength(3);
      const scEval = body.find(
        (e: { securityNamespaceId: string }) => e.securityNamespaceId === "49b48001-ca20-4adc-8111-5b60c903a50c",
      );
      expect(scEval).toBeDefined();
      expect(scEval.token).toBe(`endpoints/${PROJECT_ID}`);
    });

    it("returns canCreateServiceConnections:false when the service connection check is denied", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true, true, false]));
      (global as any).fetch = mockFetch;
      const template = makeTemplate({
        serviceConnections: [
          {
            name: "azure-prod",
            type: "AzureRM",
            authorizationScheme: "ServicePrincipal",
            authorization: {},
          },
        ],
      });
      const result = await checkTemplatePermissions(PROJECT_ID, template);

      expect(result.canCreateRepos).toBe(true);
      expect(result.canCreatePipelines).toBe(true);
      expect(result.canCreateServiceConnections).toBe(false);
    });
  });

  // --- checkServiceConnectionPermission ------------------------------------

  describe("checkServiceConnectionPermission", () => {
    it("returns true when batch API grants the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true]));
      expect(await checkServiceConnectionPermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when batch API denies the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([false]));
      expect(await checkServiceConnectionPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on non-ok response (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence({ ok: false, status: 403 });
      expect(await checkServiceConnectionPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on network error (fail-closed)", async () => {
      (global as any).fetch = jest.fn().mockRejectedValue(new Error("Network down"));
      expect(await checkServiceConnectionPermission(PROJECT_ID)).toBe(false);
    });

    it("calls permissionevaluationbatch with correct namespace, token, and permission bits", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      await checkServiceConnectionPermission(PROJECT_ID);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${COLLECTION_URL}/_apis/security/permissionevaluationbatch?api-version=7.0`);
      expect(JSON.parse(options.body).evaluations).toEqual([
        expect.objectContaining({
          securityNamespaceId: "49b48001-ca20-4adc-8111-5b60c903a50c",
          token: `endpoints/${PROJECT_ID}`,
          permissions: 2,
        }),
      ]);
    });
  });

  // --- checkCollectionAdminPermission --------------------------------------

  describe("checkCollectionAdminPermission", () => {
    it("returns true when batch API grants the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true]));
      expect(await checkCollectionAdminPermission()).toBe(true);
    });

    it("returns false when batch API denies the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([false]));
      expect(await checkCollectionAdminPermission()).toBe(false);
    });

    it("returns false on non-ok response (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence({ ok: false, status: 403 });
      expect(await checkCollectionAdminPermission()).toBe(false);
    });

    it("returns false on network error (fail-closed)", async () => {
      (global as any).fetch = jest.fn().mockRejectedValue(new Error("Network down"));
      expect(await checkCollectionAdminPermission()).toBe(false);
    });

    it("calls permissionevaluationbatch with correct namespace and $COLLECTION token", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      await checkCollectionAdminPermission();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${COLLECTION_URL}/_apis/security/permissionevaluationbatch?api-version=7.0`);
      expect(options.headers.Authorization).toBe("Bearer mock-token");
      expect(JSON.parse(options.body).evaluations).toEqual([
        expect.objectContaining({
          securityNamespaceId: "3e65f728-f8bc-4ecd-8764-7e378b19bfa7",
          token: "$COLLECTION",
          permissions: 2,
        }),
      ]);
    });
  });

  // --- /tfs/ path support --------------------------------------------------

  describe("/tfs/ path support", () => {
    it("uses /tfs/ path from LocationService in permissionsBatch URL", async () => {
      setupOnPrem(TFS_COLLECTION_URL);
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      await checkRepoPermission(PROJECT_ID);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toMatch(
        /^https:\/\/myserver\.contoso\.com\/tfs\/DefaultCollection\/_apis\/security\/permissionevaluationbatch/,
      );
    });

    it("uses /tfs/ path for collection admin check", async () => {
      setupOnPrem(TFS_COLLECTION_URL);
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      await checkCollectionAdminPermission();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toMatch(
        /^https:\/\/myserver\.contoso\.com\/tfs\/DefaultCollection\/_apis\/security\/permissionevaluationbatch/,
      );
    });
  });
});

// =============================================================================
// Cloud
// =============================================================================

describe("Cloud", () => {
  beforeEach(() => {
    setupCloud();
  });

  // --- checkRepoPermission -------------------------------------------------

  describe("checkRepoPermission", () => {
    it("returns true when batch API grants the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true]));
      expect(await checkRepoPermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when batch API denies the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([false]));
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on non-ok batch response (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence({ ok: false, status: 403 });
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on network error (fail-closed)", async () => {
      (global as any).fetch = jest.fn().mockRejectedValue(new Error("Network down"));
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("makes exactly 1 fetch call (batch only) with no descriptor lookup", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      await checkRepoPermission(PROJECT_ID);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const urls: string[] = mockFetch.mock.calls.map((c: any[]) => c[0]);
      expect(urls[0]).toContain("permissionevaluationbatch");
      expect(urls).not.toEqual(expect.arrayContaining([expect.stringContaining("identities")]));
      expect(urls).not.toEqual(expect.arrayContaining([expect.stringContaining("graph")]));
    });
  });

  // --- checkPipelinePermission ---------------------------------------------

  describe("checkPipelinePermission", () => {
    it("returns true when batch API grants the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true]));
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when batch API denies the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([false]));
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
    });
  });

  // --- checkTemplatePermissions --------------------------------------------

  describe("checkTemplatePermissions", () => {
    it("returns both true when batch grants both permissions", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true, true]));
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result).toEqual({
        canCreateRepos: true,
        canCreatePipelines: true,
        canCreateServiceConnections: true,
        canCreateVariableGroups: true,
      });
    });

    it("sends a single batch request (1 fetch call)", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true, true]));
      (global as any).fetch = mockFetch;
      await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns all true without any API calls when template needs nothing", async () => {
      const mockFetch = jest.fn();
      (global as any).fetch = mockFetch;
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate({ repositories: [], pipelines: [] }));
      expect(result).toEqual({
        canCreateRepos: true,
        canCreatePipelines: true,
        canCreateServiceConnections: true,
        canCreateVariableGroups: true,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("fails closed (both false) on batch API error", async () => {
      (global as any).fetch = mockFetchSequence({ ok: false, status: 500 });
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result).toEqual({
        canCreateRepos: false,
        canCreatePipelines: false,
        canCreateServiceConnections: true,
        canCreateVariableGroups: true,
      });
    });
  });

  // --- checkServiceConnectionPermission ------------------------------------

  describe("checkServiceConnectionPermission", () => {
    it("returns true when batch API grants the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true]));
      expect(await checkServiceConnectionPermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when batch API denies the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([false]));
      expect(await checkServiceConnectionPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on non-ok response (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence({ ok: false, status: 403 });
      expect(await checkServiceConnectionPermission(PROJECT_ID)).toBe(false);
    });
  });

  // --- checkCollectionAdminPermission --------------------------------------

  describe("checkCollectionAdminPermission", () => {
    it("returns true when batch API grants the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([true]));
      expect(await checkCollectionAdminPermission()).toBe(true);
    });

    it("returns false when batch API denies the permission", async () => {
      (global as any).fetch = mockFetchSequence(makeBatchResponse([false]));
      expect(await checkCollectionAdminPermission()).toBe(false);
    });

    it("uses the collection URL for the batch endpoint", async () => {
      const mockFetch = mockFetchSequence(makeBatchResponse([true]));
      (global as any).fetch = mockFetch;
      await checkCollectionAdminPermission();

      const [batchUrl] = mockFetch.mock.calls[0];
      expect(batchUrl).toMatch(/^https:\/\/dev\.azure\.com\/MyOrg\/_apis\/security\/permissionevaluationbatch/);
    });

    it("returns false on non-ok response (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence({ ok: false, status: 403 });
      expect(await checkCollectionAdminPermission()).toBe(false);
    });
  });
});
