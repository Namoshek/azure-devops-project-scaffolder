// locationService has module-level cache, so most tests reset modules and
// use doMock + require to get a fresh instance.

const COLLECTION_URL = "https://myserver.contoso.com/tfs/DefaultCollection";
const SEARCH_URL = "https://almsearch.dev.azure.com/MyOrg";

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  jest.clearAllMocks();
});

function loadFreshModule(serviceLocationUrl: string, resourceAreaUrl: string | "throw" = "") {
  const mockGetServiceLocation = jest.fn().mockResolvedValue(serviceLocationUrl);
  const mockGetResourceAreaLocation = jest.fn();

  if (resourceAreaUrl === "throw") {
    mockGetResourceAreaLocation.mockRejectedValue(new Error("Area not registered"));
  } else {
    mockGetResourceAreaLocation.mockResolvedValue(resourceAreaUrl);
  }

  jest.doMock("azure-devops-extension-sdk", () => ({
    getService: jest.fn().mockResolvedValue({
      getServiceLocation: mockGetServiceLocation,
      getResourceAreaLocation: mockGetResourceAreaLocation,
    }),
  }));

  const { getCollectionUrl, getSearchServiceUrl } = require("../../src/Hub/services/locationService") as {
    getCollectionUrl: () => Promise<string>;
    getSearchServiceUrl: () => Promise<string>;
  };

  return {
    getCollectionUrl,
    getSearchServiceUrl,
    mockGetServiceLocation,
    mockGetResourceAreaLocation,
  };
}

describe("getCollectionUrl", () => {
  it("returns the URL from ILocationService.getServiceLocation()", async () => {
    const { getCollectionUrl } = loadFreshModule(COLLECTION_URL);
    const url = await getCollectionUrl();
    expect(url).toBe(COLLECTION_URL);
  });

  it("strips trailing slashes from the returned URL", async () => {
    const { getCollectionUrl } = loadFreshModule("https://dev.azure.com/MyOrg/");
    const url = await getCollectionUrl();
    expect(url).toBe("https://dev.azure.com/MyOrg");
  });

  it("caches the result across multiple calls", async () => {
    const { getCollectionUrl, mockGetServiceLocation } = loadFreshModule(COLLECTION_URL);
    await getCollectionUrl();
    await getCollectionUrl();
    expect(mockGetServiceLocation).toHaveBeenCalledTimes(1);
  });

  it("returns correct URL for cloud instances", async () => {
    const { getCollectionUrl } = loadFreshModule("https://dev.azure.com/MyOrg");
    const url = await getCollectionUrl();
    expect(url).toBe("https://dev.azure.com/MyOrg");
  });

  it("returns correct URL for on-prem without /tfs/ prefix", async () => {
    const { getCollectionUrl } = loadFreshModule("https://myserver.contoso.com/DefaultCollection");
    const url = await getCollectionUrl();
    expect(url).toBe("https://myserver.contoso.com/DefaultCollection");
  });

  it("returns correct URL for old TFS with /tfs/ prefix", async () => {
    const { getCollectionUrl } = loadFreshModule("https://myserver.contoso.com/tfs/DefaultCollection");
    const url = await getCollectionUrl();
    expect(url).toBe("https://myserver.contoso.com/tfs/DefaultCollection");
  });
});

describe("getSearchServiceUrl", () => {
  it("returns the resource area URL on cloud (non-empty result)", async () => {
    const { getSearchServiceUrl } = loadFreshModule(COLLECTION_URL, SEARCH_URL);
    const url = await getSearchServiceUrl();
    expect(url).toBe(SEARCH_URL);
  });

  it("strips trailing slashes from the resource area URL", async () => {
    const { getSearchServiceUrl } = loadFreshModule(COLLECTION_URL, `${SEARCH_URL}/`);
    const url = await getSearchServiceUrl();
    expect(url).toBe(SEARCH_URL);
  });

  it("falls back to the collection URL when getResourceAreaLocation returns an empty string", async () => {
    // Empty string = on-prem Server where the resource area is not registered.
    const { getSearchServiceUrl } = loadFreshModule(COLLECTION_URL, "");
    const url = await getSearchServiceUrl();
    expect(url).toBe(COLLECTION_URL);
  });

  it("falls back to the collection URL when getResourceAreaLocation throws", async () => {
    // Some on-prem installations throw instead of returning an empty string.
    const { getSearchServiceUrl } = loadFreshModule(COLLECTION_URL, "throw");
    const url = await getSearchServiceUrl();
    expect(url).toBe(COLLECTION_URL);
  });

  it("caches the result across multiple calls", async () => {
    const { getSearchServiceUrl, mockGetResourceAreaLocation } = loadFreshModule(COLLECTION_URL, SEARCH_URL);
    await getSearchServiceUrl();
    await getSearchServiceUrl();
    expect(mockGetResourceAreaLocation).toHaveBeenCalledTimes(1);
  });
});
