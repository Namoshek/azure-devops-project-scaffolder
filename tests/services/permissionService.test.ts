import {
  checkRepoPermission,
  checkPipelinePermission,
  checkTemplatePermissions,
  checkCollectionAdminPermission,
} from "../../src/Hub/services/permissionService";
import type { TemplateDefinition } from "../../src/Hub/types/templateTypes";

// --- Mocks -------------------------------------------------------------------

const mockGetDescriptor = jest.fn();

jest.mock("azure-devops-extension-sdk", () => ({
  getAccessToken: jest.fn(),
  getHost: jest.fn(),
  getUser: jest.fn(),
}));

jest.mock("azure-devops-extension-api", () => ({
  getClient: jest.fn().mockReturnValue({
    getDescriptor: (...args: unknown[]) => mockGetDescriptor(...args),
  }),
}));

jest.mock("azure-devops-extension-api/Graph", () => ({
  GraphRestClient: jest.fn(),
}));

jest.mock("../../src/Hub/services/locationService", () => ({
  getCollectionUrl: jest.fn(),
}));

import * as SDK from "azure-devops-extension-sdk";
import { getCollectionUrl } from "../../src/Hub/services/locationService";

const mockGetAccessToken = SDK.getAccessToken as jest.Mock;
const mockGetHost = SDK.getHost as jest.Mock;
const mockGetUser = SDK.getUser as jest.Mock;
const mockGetCollectionUrl = getCollectionUrl as jest.Mock;

// --- Constants ---------------------------------------------------------------

const COLLECTION_URL = "https://myserver.contoso.com/DefaultCollection";
const TFS_COLLECTION_URL = "https://myserver.contoso.com/tfs/DefaultCollection";
const CLOUD_COLLECTION_URL = "https://dev.azure.com/MyOrg";

const PROJECT_ID = "proj-id-123";
const USER_ID = "5828435a-0bfd-493d-afe1-a04fdb7bf090";

// On-prem descriptor format (Identity API)
const IDENTITY_DESCRIPTOR =
  "System.Security.Principal.WindowsIdentity;S-1-5-21-12345-67890-111";
// Cloud descriptor format (Graph API)
const GRAPH_DESCRIPTOR = "aad.NWQyMzRlOWUtYTQ5ZS03MDc0LTk3ZmItOWIzYjRmZjVm";

// --- Helpers -----------------------------------------------------------------

function makeIdentityResponse(descriptor = IDENTITY_DESCRIPTOR) {
  return {
    ok: true,
    json: () => Promise.resolve({ descriptor }),
  };
}

function makeAclResponse(effectiveAllow: number, descriptor: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        count: 1,
        value: [
          {
            token: "...",
            acesDictionary: {
              [descriptor]: {
                descriptor,
                allow: 0,
                deny: 0,
                extendedInfo: { effectiveAllow, effectiveDeny: 0 },
              },
            },
          },
        ],
      }),
  };
}

function makePermissionsResponse(allowed: boolean) {
  return {
    ok: true,
    json: () => Promise.resolve({ value: [allowed] }),
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

function makeTemplate(
  overrides: Partial<TemplateDefinition> = {},
): TemplateDefinition {
  return {
    id: "tpl-1",
    name: "Test Template",
    version: "1.0.0",
    parameters: [],
    repositories: [
      { name: "my-repo", sourcePath: "src", defaultBranch: "main" },
    ],
    pipelines: [
      {
        name: "my-pipeline",
        repository: "my-repo",
        yamlPath: "azure-pipelines.yml",
      },
    ],
    ...overrides,
  };
}

// --- Setup -------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccessToken.mockResolvedValue("mock-token");
  mockGetUser.mockReturnValue({ id: USER_ID });
  mockGetDescriptor.mockReset();
});

// =============================================================================
// On-premises (Identity API path)
// =============================================================================

describe("On-premises (Identity API)", () => {
  beforeEach(() => {
    setupOnPrem();
  });

  // --- checkRepoPermission -------------------------------------------------

  describe("checkRepoPermission", () => {
    it("returns true when effectiveAllow has all required bits set", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(260, IDENTITY_DESCRIPTOR),
      );
      expect(await checkRepoPermission(PROJECT_ID)).toBe(true);
    });

    it("returns true when effectiveAllow has more bits than required", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(491382, IDENTITY_DESCRIPTOR),
      );
      expect(await checkRepoPermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when effectiveAllow is missing a required bit", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(4, IDENTITY_DESCRIPTOR),
      );
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false when effectiveAllow is 0", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(0, IDENTITY_DESCRIPTOR),
      );
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false when ACL response has no entries (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence(makeIdentityResponse(), {
        ok: true,
        json: () => Promise.resolve({ count: 0, value: [] }),
      });
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false when ACL endpoint returns non-ok (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence(makeIdentityResponse(), {
        ok: false,
        status: 403,
      });
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false when identity lookup fails (fail-closed)", async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401 });
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on a network error (fail-closed)", async () => {
      (global as any).fetch = jest
        .fn()
        .mockRejectedValue(new Error("Network down"));
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("calls the Identity endpoint then the ACL endpoint with correct args", async () => {
      const mockFetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(260, IDENTITY_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      await checkRepoPermission(PROJECT_ID);

      const [identityUrl] = mockFetch.mock.calls[0];
      expect(identityUrl).toContain(`_apis/identities/${USER_ID}`);
      expect(identityUrl).toContain("api-version=6.0");

      const [aclUrl, options] = mockFetch.mock.calls[1];
      expect(aclUrl).toContain(
        `_apis/accesscontrollists/2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87`,
      );
      expect(aclUrl).toContain(encodeURIComponent(`repoV2/${PROJECT_ID}`));
      expect(aclUrl).toContain(encodeURIComponent(IDENTITY_DESCRIPTOR));
      expect(aclUrl).toContain("includeExtendedInfo=true");
      expect(aclUrl).toContain("api-version=6.0");
      expect(options.headers.Authorization).toBe("Bearer mock-token");
    });

    it("does not call the Graph API", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(260, IDENTITY_DESCRIPTOR),
      );
      await checkRepoPermission(PROJECT_ID);
      expect(mockGetDescriptor).not.toHaveBeenCalled();
    });
  });

  // --- checkPipelinePermission ---------------------------------------------

  describe("checkPipelinePermission", () => {
    it("returns true when effectiveAllow has EditBuildDefinition bit", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(2048, IDENTITY_DESCRIPTOR),
      );
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when effectiveAllow is missing the bit", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(1024, IDENTITY_DESCRIPTOR),
      );
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on non-ok ACL response (fail-closed)", async () => {
      (global as any).fetch = mockFetchSequence(makeIdentityResponse(), {
        ok: false,
        status: 500,
      });
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
    });

    it("returns false when identity lookup fails (fail-closed)", async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401 });
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on a network error (fail-closed)", async () => {
      (global as any).fetch = jest
        .fn()
        .mockRejectedValue(new Error("Network down"));
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
    });

    it("calls Identity endpoint then ACL endpoint with correct args", async () => {
      const mockFetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(2048, IDENTITY_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      await checkPipelinePermission(PROJECT_ID);

      const [identityUrl] = mockFetch.mock.calls[0];
      expect(identityUrl).toContain(`_apis/identities/${USER_ID}`);

      const [aclUrl] = mockFetch.mock.calls[1];
      expect(aclUrl).toContain(
        `_apis/accesscontrollists/33344d9c-fc72-4d6f-aba5-fa317101a7e9`,
      );
      expect(aclUrl).toContain(encodeURIComponent(PROJECT_ID));
      expect(aclUrl).toContain(encodeURIComponent(IDENTITY_DESCRIPTOR));
      expect(aclUrl).toContain("api-version=6.0");
    });
  });

  // --- checkTemplatePermissions --------------------------------------------

  describe("checkTemplatePermissions", () => {
    it("returns both true when effectiveAllow covers both required bits", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(491382, IDENTITY_DESCRIPTOR),
        makeAclResponse(491382, IDENTITY_DESCRIPTOR),
      );
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result).toEqual({
        canCreateRepos: true,
        canCreatePipelines: true,
      });
    });

    it("resolves descriptor once then checks both ACLs in parallel (3 fetch calls)", async () => {
      const mockFetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(491382, IDENTITY_DESCRIPTOR),
        makeAclResponse(491382, IDENTITY_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("returns canCreateRepos:false when repo bits are missing", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(0, IDENTITY_DESCRIPTOR),
        makeAclResponse(2048, IDENTITY_DESCRIPTOR),
      );
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result.canCreateRepos).toBe(false);
      expect(result.canCreatePipelines).toBe(true);
    });

    it("returns canCreatePipelines:false when pipeline bits are missing", async () => {
      (global as any).fetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(260, IDENTITY_DESCRIPTOR),
        makeAclResponse(0, IDENTITY_DESCRIPTOR),
      );
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result.canCreateRepos).toBe(true);
      expect(result.canCreatePipelines).toBe(false);
    });

    it("returns false for both when identity lookup fails", async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401 });
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result).toEqual({
        canCreateRepos: false,
        canCreatePipelines: false,
      });
    });

    it("skips repo ACL when template has no repositories (2 fetch calls)", async () => {
      const mockFetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(2048, IDENTITY_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      const result = await checkTemplatePermissions(
        PROJECT_ID,
        makeTemplate({ repositories: [] }),
      );
      expect(result.canCreateRepos).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("skips pipeline ACL when template has no pipelines (2 fetch calls)", async () => {
      const mockFetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(260, IDENTITY_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      const result = await checkTemplatePermissions(
        PROJECT_ID,
        makeTemplate({ pipelines: [] }),
      );
      expect(result.canCreatePipelines).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns all true without any API calls when template needs nothing", async () => {
      const mockFetch = jest.fn();
      (global as any).fetch = mockFetch;
      const result = await checkTemplatePermissions(
        PROJECT_ID,
        makeTemplate({ repositories: [], pipelines: [] }),
      );
      expect(result).toEqual({
        canCreateRepos: true,
        canCreatePipelines: true,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // --- checkCollectionAdminPermission --------------------------------------

  describe("checkCollectionAdminPermission", () => {
    it("returns true when user has the collection admin bit", async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValue(makePermissionsResponse(true));
      expect(await checkCollectionAdminPermission()).toBe(true);
    });

    it("returns false when user does not have the bit", async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValue(makePermissionsResponse(false));
      expect(await checkCollectionAdminPermission()).toBe(false);
    });

    it("returns false on non-ok response (fail-closed)", async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 403 });
      expect(await checkCollectionAdminPermission()).toBe(false);
    });

    it("returns false on network error (fail-closed)", async () => {
      (global as any).fetch = jest
        .fn()
        .mockRejectedValue(new Error("Network down"));
      expect(await checkCollectionAdminPermission()).toBe(false);
    });

    it("calls the permissions endpoint with correct args and api-version=6.0", async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValue(makePermissionsResponse(true));
      (global as any).fetch = mockFetch;
      await checkCollectionAdminPermission();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain(
        `_apis/permissions/3e65f728-f8bc-4ecd-8764-7e378b19bfa7/2`,
      );
      expect(url).toContain(encodeURIComponent("$COLLECTION"));
      expect(url).toContain("api-version=6.0");
      expect(options.headers.Authorization).toBe("Bearer mock-token");
    });
  });

  // --- /tfs/ path support --------------------------------------------------

  describe("/tfs/ path support", () => {
    it("includes /tfs/ prefix from LocationService in identity URL", async () => {
      setupOnPrem(TFS_COLLECTION_URL);
      const mockFetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(260, IDENTITY_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      await checkRepoPermission(PROJECT_ID);

      const [identityUrl] = mockFetch.mock.calls[0];
      expect(identityUrl).toMatch(
        /^https:\/\/myserver\.contoso\.com\/tfs\/DefaultCollection\/_apis\/identities\//,
      );
    });

    it("includes /tfs/ prefix in ACL URL", async () => {
      setupOnPrem(TFS_COLLECTION_URL);
      const mockFetch = mockFetchSequence(
        makeIdentityResponse(),
        makeAclResponse(260, IDENTITY_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      await checkRepoPermission(PROJECT_ID);

      const [aclUrl] = mockFetch.mock.calls[1];
      expect(aclUrl).toMatch(
        /^https:\/\/myserver\.contoso\.com\/tfs\/DefaultCollection\/_apis\/accesscontrollists\//,
      );
    });

    it("includes /tfs/ prefix in collection admin permission URL", async () => {
      setupOnPrem(TFS_COLLECTION_URL);
      const mockFetch = jest
        .fn()
        .mockResolvedValue(makePermissionsResponse(true));
      (global as any).fetch = mockFetch;
      await checkCollectionAdminPermission();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toMatch(
        /^https:\/\/myserver\.contoso\.com\/tfs\/DefaultCollection\/_apis\/permissions\//,
      );
    });
  });
});

// =============================================================================
// Cloud (Graph API path)
// =============================================================================

describe("Cloud (Graph API)", () => {
  beforeEach(() => {
    setupCloud();
    mockGetDescriptor.mockResolvedValue({ value: GRAPH_DESCRIPTOR });
  });

  // --- checkRepoPermission -------------------------------------------------

  describe("checkRepoPermission", () => {
    it("returns true when effectiveAllow has all required bits", async () => {
      (global as any).fetch = mockFetchSequence(
        makeAclResponse(260, GRAPH_DESCRIPTOR),
      );
      expect(await checkRepoPermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when effectiveAllow is missing a required bit", async () => {
      (global as any).fetch = mockFetchSequence(
        makeAclResponse(4, GRAPH_DESCRIPTOR),
      );
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("calls Graph API (not Identity fetch) for descriptor resolution", async () => {
      const mockFetch = mockFetchSequence(
        makeAclResponse(260, GRAPH_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      await checkRepoPermission(PROJECT_ID);

      expect(mockGetDescriptor).toHaveBeenCalledWith(USER_ID);
      // Only 1 fetch call (ACL), not 2 (no Identity fetch)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("uses the Graph descriptor in the ACL request", async () => {
      const mockFetch = mockFetchSequence(
        makeAclResponse(260, GRAPH_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      await checkRepoPermission(PROJECT_ID);

      const [aclUrl] = mockFetch.mock.calls[0];
      expect(aclUrl).toContain(encodeURIComponent(GRAPH_DESCRIPTOR));
      expect(aclUrl).toContain("api-version=6.0");
    });

    it("returns false when Graph API throws (fail-closed)", async () => {
      mockGetDescriptor.mockRejectedValue(new Error("Graph unavailable"));
      (global as any).fetch = jest.fn();
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });

    it("returns false on a network error (fail-closed)", async () => {
      (global as any).fetch = jest
        .fn()
        .mockRejectedValue(new Error("Network down"));
      expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
    });
  });

  // --- checkPipelinePermission ---------------------------------------------

  describe("checkPipelinePermission", () => {
    it("returns true when effectiveAllow has EditBuildDefinition bit", async () => {
      (global as any).fetch = mockFetchSequence(
        makeAclResponse(2048, GRAPH_DESCRIPTOR),
      );
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(true);
    });

    it("returns false when effectiveAllow is missing the bit", async () => {
      (global as any).fetch = mockFetchSequence(
        makeAclResponse(1024, GRAPH_DESCRIPTOR),
      );
      expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
    });

    it("calls Graph API for descriptor then ACL endpoint (1 fetch call)", async () => {
      const mockFetch = mockFetchSequence(
        makeAclResponse(2048, GRAPH_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      await checkPipelinePermission(PROJECT_ID);

      expect(mockGetDescriptor).toHaveBeenCalledWith(USER_ID);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // --- checkTemplatePermissions --------------------------------------------

  describe("checkTemplatePermissions", () => {
    it("returns both true when effectiveAllow covers both required bits", async () => {
      (global as any).fetch = mockFetchSequence(
        makeAclResponse(491382, GRAPH_DESCRIPTOR),
        makeAclResponse(491382, GRAPH_DESCRIPTOR),
      );
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result).toEqual({
        canCreateRepos: true,
        canCreatePipelines: true,
      });
    });

    it("resolves descriptor once via Graph then checks ACLs in parallel (2 fetch calls)", async () => {
      const mockFetch = mockFetchSequence(
        makeAclResponse(491382, GRAPH_DESCRIPTOR),
        makeAclResponse(491382, GRAPH_DESCRIPTOR),
      );
      (global as any).fetch = mockFetch;
      await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(mockGetDescriptor).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns false for both when Graph API throws (fail-closed)", async () => {
      mockGetDescriptor.mockRejectedValue(new Error("Graph unavailable"));
      (global as any).fetch = jest.fn();
      const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
      expect(result).toEqual({
        canCreateRepos: false,
        canCreatePipelines: false,
      });
    });

    it("returns all true without any API calls when template needs nothing", async () => {
      const mockFetch = jest.fn();
      (global as any).fetch = mockFetch;
      const result = await checkTemplatePermissions(
        PROJECT_ID,
        makeTemplate({ repositories: [], pipelines: [] }),
      );
      expect(result).toEqual({
        canCreateRepos: true,
        canCreatePipelines: true,
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockGetDescriptor).not.toHaveBeenCalled();
    });
  });

  // --- checkCollectionAdminPermission --------------------------------------

  describe("checkCollectionAdminPermission", () => {
    it("returns true when user has the collection admin bit", async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValue(makePermissionsResponse(true));
      expect(await checkCollectionAdminPermission()).toBe(true);
    });

    it("returns false when user does not have the bit", async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValue(makePermissionsResponse(false));
      expect(await checkCollectionAdminPermission()).toBe(false);
    });

    it("uses cloud collection URL in the permissions endpoint", async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValue(makePermissionsResponse(true));
      (global as any).fetch = mockFetch;
      await checkCollectionAdminPermission();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toMatch(
        /^https:\/\/dev\.azure\.com\/MyOrg\/_apis\/permissions\//,
      );
      expect(url).toContain("api-version=6.0");
    });
  });
});
