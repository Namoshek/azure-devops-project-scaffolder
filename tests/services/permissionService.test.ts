import { checkProjectAdminPermission } from "../../src/Hub/services/permissionService";

jest.mock("azure-devops-extension-sdk", () => ({
  getAccessToken: jest.fn(),
  getHost: jest.fn(),
}));

import * as SDK from "azure-devops-extension-sdk";

const mockGetAccessToken = SDK.getAccessToken as jest.Mock;
const mockGetHost = SDK.getHost as jest.Mock;

const ORIGIN = "https://dev.azure.com";
const COLLECTION = "MyOrg";
const PROJECT_ID = "proj-id-123";

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).window = { location: { origin: ORIGIN } };
  mockGetAccessToken.mockResolvedValue("mock-token");
  mockGetHost.mockReturnValue({ name: COLLECTION });
});

describe("checkProjectAdminPermission", () => {
  it("returns true when the API responds with value: [true]", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [true] }),
    });

    const result = await checkProjectAdminPermission(PROJECT_ID);
    expect(result).toBe(true);
  });

  it("returns false when the API responds with value: [false]", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [false] }),
    });

    const result = await checkProjectAdminPermission(PROJECT_ID);
    expect(result).toBe(false);
  });

  it("returns false when the value array is empty", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [] }),
    });

    const result = await checkProjectAdminPermission(PROJECT_ID);
    expect(result).toBe(false);
  });

  it("returns false when the response is not ok (fail-closed)", async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    const result = await checkProjectAdminPermission(PROJECT_ID);
    expect(result).toBe(false);
  });

  it("returns false on a network error (fail-closed)", async () => {
    (global as any).fetch = jest
      .fn()
      .mockRejectedValue(new Error("Network down"));

    const result = await checkProjectAdminPermission(PROJECT_ID);
    expect(result).toBe(false);
  });

  it("calls the permissions API with the correct URL and bearer token", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [true] }),
    });
    (global as any).fetch = mockFetch;

    await checkProjectAdminPermission(PROJECT_ID);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain(ORIGIN);
    expect(url).toContain(COLLECTION);
    expect(url).toContain("_apis/permissions");
    expect(options.headers.Authorization).toBe("Bearer mock-token");
  });

  it("includes the project token in the URL", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [true] }),
    });
    (global as any).fetch = mockFetch;

    await checkProjectAdminPermission(PROJECT_ID);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(
      encodeURIComponent(
        `$PROJECT:vstfs:///Classification/TeamProject/${PROJECT_ID}`,
      ),
    );
  });
});
