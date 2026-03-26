import {
  checkRepoPermission,
  checkPipelinePermission,
  checkTemplatePermissions,
} from "../../src/Hub/services/permissionService";
import type { TemplateDefinition } from "../../src/Hub/types/templateTypes";

jest.mock("azure-devops-extension-sdk", () => ({
  getAccessToken: jest.fn(),
  getHost: jest.fn(),
  getUser: jest.fn(),
}));

import * as SDK from "azure-devops-extension-sdk";

const mockGetAccessToken = SDK.getAccessToken as jest.Mock;
const mockGetHost = SDK.getHost as jest.Mock;
const mockGetUser = SDK.getUser as jest.Mock;

const ORIGIN = "https://dev.azure.com";
const COLLECTION = "MyOrg";
const PROJECT_ID = "proj-id-123";
const USER_ID = "5828435a-0bfd-493d-afe1-a04fdb7bf090";
const DESCRIPTOR =
  "System.Security.Principal.WindowsIdentity;S-1-5-21-12345-67890-111";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIdentityResponse(descriptor = DESCRIPTOR) {
  return {
    ok: true,
    json: () => Promise.resolve({ descriptor }),
  };
}

function makeAclResponse(effectiveAllow: number, descriptor = DESCRIPTOR) {
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

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).window = { location: { origin: ORIGIN } };
  mockGetAccessToken.mockResolvedValue("mock-token");
  mockGetHost.mockReturnValue({ name: COLLECTION });
  mockGetUser.mockReturnValue({ id: USER_ID });
});

// ─── checkRepoPermission ──────────────────────────────────────────────────────

describe("checkRepoPermission", () => {
  it("returns true when effectiveAllow has all required bits set", async () => {
    // 260 = CreateRepository (256) + GenericContribute (4)
    (global as any).fetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(260),
    );
    expect(await checkRepoPermission(PROJECT_ID)).toBe(true);
  });

  it("returns true when effectiveAllow has more bits than required", async () => {
    // 491382 is what ADO typically returns for an admin; 491382 & 260 === 260
    (global as any).fetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(491382),
    );
    expect(await checkRepoPermission(PROJECT_ID)).toBe(true);
  });

  it("returns false when effectiveAllow is missing a required bit", async () => {
    // Has GenericContribute (4) but not CreateRepository (256)
    (global as any).fetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(4),
    );
    expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
  });

  it("returns false when effectiveAllow is 0", async () => {
    (global as any).fetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(0),
    );
    expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
  });

  it("returns false when the ACL response has no entries (fail-closed)", async () => {
    (global as any).fetch = mockFetchSequence(makeIdentityResponse(), {
      ok: true,
      json: () => Promise.resolve({ count: 0, value: [] }),
    });
    expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
  });

  it("returns false when the ACL endpoint returns non-ok (fail-closed)", async () => {
    (global as any).fetch = mockFetchSequence(makeIdentityResponse(), {
      ok: false,
      status: 403,
    });
    expect(await checkRepoPermission(PROJECT_ID)).toBe(false);
  });

  it("returns false when the identity lookup fails (fail-closed)", async () => {
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

  it("calls the identity endpoint then the ACL endpoint with correct args", async () => {
    const mockFetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(260),
    );
    (global as any).fetch = mockFetch;
    await checkRepoPermission(PROJECT_ID);

    // First call: identity lookup
    const [identityUrl] = mockFetch.mock.calls[0];
    expect(identityUrl).toContain(`_apis/identities/${USER_ID}`);

    // Second call: ACL endpoint
    const [aclUrl, options] = mockFetch.mock.calls[1];
    expect(aclUrl).toContain(
      `_apis/accesscontrollists/2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87`,
    );
    expect(aclUrl).toContain(encodeURIComponent(`repoV2/${PROJECT_ID}`));
    expect(aclUrl).toContain(encodeURIComponent(DESCRIPTOR));
    expect(aclUrl).toContain("includeExtendedInfo=true");
    expect(options.headers.Authorization).toBe("Bearer mock-token");
  });
});

// ─── checkPipelinePermission ──────────────────────────────────────────────────

describe("checkPipelinePermission", () => {
  it("returns true when effectiveAllow has the EditBuildDefinition bit (2048)", async () => {
    (global as any).fetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(2048),
    );
    expect(await checkPipelinePermission(PROJECT_ID)).toBe(true);
  });

  it("returns false when effectiveAllow is missing the EditBuildDefinition bit", async () => {
    (global as any).fetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(1024),
    );
    expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
  });

  it("returns false on a non-ok ACL response (fail-closed)", async () => {
    (global as any).fetch = mockFetchSequence(makeIdentityResponse(), {
      ok: false,
      status: 500,
    });
    expect(await checkPipelinePermission(PROJECT_ID)).toBe(false);
  });

  it("returns false when the identity lookup fails (fail-closed)", async () => {
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

  it("calls the identity endpoint then the ACL endpoint with correct args", async () => {
    const mockFetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(2048),
    );
    (global as any).fetch = mockFetch;
    await checkPipelinePermission(PROJECT_ID);

    // First call: identity lookup
    const [identityUrl] = mockFetch.mock.calls[0];
    expect(identityUrl).toContain(`_apis/identities/${USER_ID}`);

    // Second call: ACL endpoint
    const [aclUrl, options] = mockFetch.mock.calls[1];
    expect(aclUrl).toContain(
      `_apis/accesscontrollists/33344d9c-fc72-4d6f-aba5-fa317101a7e9`,
    );
    expect(aclUrl).toContain(encodeURIComponent(PROJECT_ID));
    expect(aclUrl).toContain(encodeURIComponent(DESCRIPTOR));
    expect(aclUrl).toContain("includeExtendedInfo=true");
    expect(options.headers.Authorization).toBe("Bearer mock-token");
  });
});

// ─── checkTemplatePermissions ─────────────────────────────────────────────────

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

describe("checkTemplatePermissions", () => {
  it("returns both true when effectiveAllow covers both required bits", async () => {
    // identity lookup, then repo ACL, then pipeline ACL
    (global as any).fetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(491382), // covers bit 260
      makeAclResponse(491382), // covers bit 2048
    );
    const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
    expect(result).toEqual({ canCreateRepos: true, canCreatePipelines: true });
  });

  it("returns canCreateRepos:false when repo effectiveAllow misses required bits", async () => {
    (global as any).fetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(0), // repo: denied
      makeAclResponse(2048), // pipeline: allowed
    );
    const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
    expect(result.canCreateRepos).toBe(false);
    expect(result.canCreatePipelines).toBe(true);
  });

  it("returns canCreatePipelines:false when pipeline effectiveAllow misses required bits", async () => {
    (global as any).fetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(260), // repo: allowed
      makeAclResponse(0), // pipeline: denied
    );
    const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
    expect(result.canCreateRepos).toBe(true);
    expect(result.canCreatePipelines).toBe(false);
  });

  it("resolves descriptor once then checks both ACLs in parallel (3 fetch calls total)", async () => {
    const mockFetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(491382),
      makeAclResponse(491382),
    );
    (global as any).fetch = mockFetch;
    await checkTemplatePermissions(PROJECT_ID, makeTemplate());
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("returns false for required resource types when identity lookup fails", async () => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401 });
    const result = await checkTemplatePermissions(PROJECT_ID, makeTemplate());
    expect(result).toEqual({
      canCreateRepos: false,
      canCreatePipelines: false,
    });
  });

  it("skips the repo ACL call when template has no repositories (2 fetch calls)", async () => {
    const mockFetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(2048),
    );
    (global as any).fetch = mockFetch;
    const template = makeTemplate({ repositories: [] });
    const result = await checkTemplatePermissions(PROJECT_ID, template);
    expect(result.canCreateRepos).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2); // identity lookup + pipeline ACL
  });

  it("skips the pipeline ACL call when template has no pipelines (2 fetch calls)", async () => {
    const mockFetch = mockFetchSequence(
      makeIdentityResponse(),
      makeAclResponse(260),
    );
    (global as any).fetch = mockFetch;
    const template = makeTemplate({ pipelines: [] });
    const result = await checkTemplatePermissions(PROJECT_ID, template);
    expect(result.canCreatePipelines).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2); // identity lookup + repo ACL
  });

  it("returns all true without any API calls when template has no repos and no pipelines", async () => {
    const mockFetch = jest.fn();
    (global as any).fetch = mockFetch;
    const template = makeTemplate({ repositories: [], pipelines: [] });
    const result = await checkTemplatePermissions(PROJECT_ID, template);
    expect(result).toEqual({ canCreateRepos: true, canCreatePipelines: true });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
