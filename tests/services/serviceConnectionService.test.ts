import { scaffoldServiceConnection } from "../../src/services/serviceConnectionService";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("azure-devops-extension-sdk", () => ({
  getAccessToken: jest.fn(),
}));

jest.mock("azure-devops-extension-api", () => ({
  getClient: jest.fn(),
}));

jest.mock("azure-devops-extension-api/ServiceEndpoint", () => ({
  ServiceEndpointRestClient: jest.fn(),
}));

jest.mock("../../src/services/preflightCheckService", () => ({
  checkServiceConnectionExists: jest.fn(),
}));

jest.mock("../../src/services/locationService", () => ({
  getCollectionUrl: jest.fn(),
}));

import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { checkServiceConnectionExists } from "../../src/services/preflightCheckService";
import { getCollectionUrl } from "../../src/services/locationService";
import { TemplateServiceConnection } from "../../src/types/templateTypes";

const mockGetAccessToken = SDK.getAccessToken as jest.Mock;
const mockGetClient = getClient as jest.Mock;
const mockCheckServiceConnectionExists = checkServiceConnectionExists as jest.Mock;
const mockGetCollectionUrl = getCollectionUrl as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConnectionTemplate(overrides: Partial<TemplateServiceConnection> = {}): TemplateServiceConnection {
  return {
    name: "{{projectName}}-azure",
    type: "AzureRM",
    authorizationScheme: "ServicePrincipal",
    url: "https://management.azure.com/",
    authorization: {
      tenantid: "{{tenantId}}",
      serviceprincipalid: "{{clientId}}",
      serviceprincipalkey: "{{clientSecret}}",
    },
    data: {
      subscriptionId: "{{subscriptionId}}",
      subscriptionName: "My Subscription",
    },
    description: "Azure service connection for {{projectName}}",
    ...overrides,
  };
}

function makeEndpointClient(overrides: { createResult?: object; createError?: Error } = {}) {
  return {
    createServiceEndpoint: overrides.createError
      ? jest.fn().mockRejectedValue(overrides.createError)
      : jest.fn().mockResolvedValue(overrides.createResult ?? { id: "ep-abc-123", name: "my-app-azure" }),
  };
}

const PARAMS = {
  projectName: "my-app",
  tenantId: "tenant-001",
  clientId: "client-001",
  clientSecret: "super-secret",
  subscriptionId: "sub-001",
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckServiceConnectionExists.mockResolvedValue({ exists: false });
  mockGetAccessToken.mockResolvedValue("mock-token");
  mockGetCollectionUrl.mockResolvedValue("https://dev.azure.com/MyOrg");
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("scaffoldServiceConnection", () => {
  // ── Happy path ─────────────────────────────────────────────────────────────

  it("creates a service connection and returns 'created' with the endpoint ID", async () => {
    const client = makeEndpointClient({ createResult: { id: "ep-xyz", name: "my-app-azure" } });
    mockGetClient.mockReturnValue(client);

    const result = await scaffoldServiceConnection("proj-1", makeConnectionTemplate(), PARAMS);

    expect(result.status).toBe("created");
    expect(result.connectionName).toBe("my-app-azure");
    expect(result.endpointId).toBe("ep-xyz");
  });

  it("renders Mustache in the connection name", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldServiceConnection("proj-1", makeConnectionTemplate(), PARAMS);

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.name).toBe("my-app-azure");
  });

  it("renders Mustache in the connection description", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldServiceConnection("proj-1", makeConnectionTemplate(), PARAMS);

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.description).toBe("Azure service connection for my-app");
  });

  it("renders Mustache in authorization parameter values", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldServiceConnection("proj-1", makeConnectionTemplate(), PARAMS);

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.authorization.parameters.tenantid).toBe("tenant-001");
    expect(endpoint.authorization.parameters.serviceprincipalid).toBe("client-001");
    expect(endpoint.authorization.parameters.serviceprincipalkey).toBe("super-secret");
  });

  it("renders Mustache in data field values", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldServiceConnection("proj-1", makeConnectionTemplate(), PARAMS);

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.data.subscriptionId).toBe("sub-001");
    expect(endpoint.data.subscriptionName).toBe("My Subscription");
  });

  it("sets the authorizationScheme on the endpoint", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldServiceConnection(
      "proj-1",
      makeConnectionTemplate({ authorizationScheme: "ManagedServiceIdentity" }),
      PARAMS,
    );

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.authorization.scheme).toBe("ManagedServiceIdentity");
  });

  it("sets the type on the endpoint", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldServiceConnection("proj-1", makeConnectionTemplate({ type: "github" }), PARAMS);

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.type).toBe("github");
  });

  it("sets the url on the endpoint", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldServiceConnection("proj-1", makeConnectionTemplate({ url: "https://github.com" }), PARAMS);

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.url).toBe("https://github.com");
  });

  it("defaults url to '' when not specified in the template", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);
    const template = makeConnectionTemplate();
    delete (template as Partial<TemplateServiceConnection>).url;

    await scaffoldServiceConnection("proj-1", template, PARAMS);

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.url).toBe("");
  });

  it("includes serviceEndpointProjectReferences with the project ID", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldServiceConnection("proj-42", makeConnectionTemplate(), PARAMS);

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.serviceEndpointProjectReferences).toHaveLength(1);
    expect(endpoint.serviceEndpointProjectReferences[0].projectReference.id).toBe("proj-42");
    expect(endpoint.serviceEndpointProjectReferences[0].name).toBe("my-app-azure");
  });

  // ── Connection already exists → skipped ───────────────────────────────────

  it("returns 'skipped' when a connection with the same name already exists", async () => {
    mockCheckServiceConnectionExists.mockResolvedValue({ exists: true });
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    const result = await scaffoldServiceConnection("proj-1", makeConnectionTemplate(), PARAMS);

    expect(result.status).toBe("skipped");
    expect(result.reason).toMatch(/already exists/i);
    expect(client.createServiceEndpoint).not.toHaveBeenCalled();
  });

  // ── createServiceEndpoint failure ─────────────────────────────────────────

  it("returns 'failed' when createServiceEndpoint throws", async () => {
    const client = makeEndpointClient({ createError: new Error("Quota exceeded") });
    mockGetClient.mockReturnValue(client);

    const result = await scaffoldServiceConnection("proj-1", makeConnectionTemplate(), PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/Failed to create service connection/i);
  });

  // ── grantAccessToAllPipelines───────────────────────────────────────────────

  it("calls the pipeline permissions PATCH when grantAccessToAllPipelines is true", async () => {
    const client = makeEndpointClient({ createResult: { id: "ep-patch-test" } });
    mockGetClient.mockReturnValue(client);

    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    (global as any).fetch = mockFetch;

    await scaffoldServiceConnection("proj-1", makeConnectionTemplate({ grantAccessToAllPipelines: true }), PARAMS);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toMatch(/pipelinepermissions\/endpoint\/ep-patch-test/);
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({
      allPipelines: { authorized: true },
      resource: { id: "ep-patch-test", name: "", type: "endpoint" },
    });
  });

  it("does not call the pipeline permissions PATCH when grantAccessToAllPipelines is false", async () => {
    const client = makeEndpointClient({ createResult: { id: "ep-no-patch" } });
    mockGetClient.mockReturnValue(client);

    const mockFetch = jest.fn();
    (global as any).fetch = mockFetch;

    await scaffoldServiceConnection("proj-1", makeConnectionTemplate({ grantAccessToAllPipelines: false }), PARAMS);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not call the pipeline permissions PATCH when grantAccessToAllPipelines is omitted", async () => {
    const client = makeEndpointClient({ createResult: { id: "ep-omitted" } });
    mockGetClient.mockReturnValue(client);

    const mockFetch = jest.fn();
    (global as any).fetch = mockFetch;

    const template = makeConnectionTemplate();
    delete (template as Partial<TemplateServiceConnection>).grantAccessToAllPipelines;

    await scaffoldServiceConnection("proj-1", template, PARAMS);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("still returns 'created' when the pipeline authorization PATCH fails (non-fatal)", async () => {
    const client = makeEndpointClient({ createResult: { id: "ep-auth-fail" } });
    mockGetClient.mockReturnValue(client);

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

    const result = await scaffoldServiceConnection(
      "proj-1",
      makeConnectionTemplate({ grantAccessToAllPipelines: true }),
      PARAMS,
    );

    expect(result.status).toBe("created");
    expect(result.endpointId).toBe("ep-auth-fail");
  });

  // ── data field handling ───────────────────────────────────────────────────

  it("defaults data to an empty object when template has no data field", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    const template = makeConnectionTemplate();
    delete (template as Partial<TemplateServiceConnection>).data;

    await scaffoldServiceConnection("proj-1", template, PARAMS);

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.data).toEqual({});
  });

  // ── description rendering ─────────────────────────────────────────────────

  it("renders Mustache in the description field", async () => {
    const client = makeEndpointClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldServiceConnection(
      "proj-1",
      makeConnectionTemplate({ description: "Connection for {{projectName}}" }),
      PARAMS,
    );

    const endpoint = client.createServiceEndpoint.mock.calls[0][0];
    expect(endpoint.description).toBe("Connection for my-app");
  });
});
