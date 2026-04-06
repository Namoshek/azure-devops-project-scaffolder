import { scaffoldVariableGroup } from "../../src/services/variableGroupService";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("azure-devops-extension-sdk", () => ({
  getAccessToken: jest.fn(),
}));

jest.mock("azure-devops-extension-api", () => ({
  getClient: jest.fn(),
}));

jest.mock("azure-devops-extension-api/TaskAgent", () => ({
  TaskAgentRestClient: jest.fn(),
}));

jest.mock("../../src/services/preflightCheckService", () => ({
  checkVariableGroupExists: jest.fn(),
}));

jest.mock("../../src/services/locationService", () => ({
  getCollectionUrl: jest.fn(),
}));

import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { checkVariableGroupExists } from "../../src/services/preflightCheckService";
import { getCollectionUrl } from "../../src/services/locationService";
import { TemplateVariableGroup } from "src/types/templateTypes";

const mockGetAccessToken = SDK.getAccessToken as jest.Mock;
const mockGetClient = getClient as jest.Mock;
const mockCheckVariableGroupExists = checkVariableGroupExists as jest.Mock;
const mockGetCollectionUrl = getCollectionUrl as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGroupTemplate(overrides: Partial<TemplateVariableGroup> = {}): TemplateVariableGroup {
  return {
    name: "{{projectName}}-vars",
    description: "Variables for {{projectName}}",
    variables: [
      { name: "APP_NAME", value: "{{projectName}}" },
      { name: "ENV", value: "prod" },
    ],
    ...overrides,
  };
}

function makeTaskAgentClient(overrides: { createResult?: object; createError?: Error } = {}) {
  return {
    addVariableGroup: overrides.createError
      ? jest.fn().mockRejectedValue(overrides.createError)
      : jest.fn().mockResolvedValue(overrides.createResult ?? { id: 7, name: "my-app-vars" }),
  };
}

const PARAMS = { projectName: "my-app" };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckVariableGroupExists.mockResolvedValue({ exists: false });
  mockGetAccessToken.mockResolvedValue("mock-token");
  mockGetCollectionUrl.mockResolvedValue("https://dev.azure.com/MyOrg");
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("scaffoldVariableGroup", () => {
  // ── Happy path ─────────────────────────────────────────────────────────────

  it("creates a variable group and returns 'created' with the group ID", async () => {
    const client = makeTaskAgentClient({ createResult: { id: 42, name: "my-app-vars" } });
    mockGetClient.mockReturnValue(client);

    const result = await scaffoldVariableGroup("proj-1", makeGroupTemplate(), PARAMS);

    expect(result.status).toBe("created");
    expect(result.groupName).toBe("my-app-vars");
    expect(result.groupId).toBe(42);
  });

  it("renders Mustache in the group name", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldVariableGroup("proj-1", makeGroupTemplate(), PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.name).toBe("my-app-vars");
  });

  it("renders Mustache in the description", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldVariableGroup("proj-1", makeGroupTemplate(), PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.description).toBe("Variables for my-app");
  });

  it("renders Mustache in variable names and values", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldVariableGroup("proj-1", makeGroupTemplate(), PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.variables["APP_NAME"]).toEqual({ value: "my-app", isSecret: false });
    expect(group.variables["ENV"]).toEqual({ value: "prod", isSecret: false });
  });

  it("marks secret variables with isSecret: true in the API payload", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    const template = makeGroupTemplate({
      variables: [{ name: "API_KEY", value: "{{apiKey}}", secret: true }],
    });

    await scaffoldVariableGroup("proj-1", template, { projectName: "my-app", apiKey: "s3cr3t" });

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.variables["API_KEY"]).toEqual({ value: "s3cr3t", isSecret: true });
  });

  it("defaults secret to false when not specified", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    const template = makeGroupTemplate({
      variables: [{ name: "PLAIN", value: "value" }],
    });

    await scaffoldVariableGroup("proj-1", template, PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.variables["PLAIN"].isSecret).toBe(false);
  });

  it("sets type to 'Vsts' on the variable group", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldVariableGroup("proj-1", makeGroupTemplate(), PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.type).toBe("Vsts");
  });

  it("sets variableGroupProjectReferences with the project ID", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldVariableGroup("proj-42", makeGroupTemplate(), PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.variableGroupProjectReferences).toHaveLength(1);
    expect(group.variableGroupProjectReferences[0].projectReference.id).toBe("proj-42");
    expect(group.variableGroupProjectReferences[0].name).toBe("my-app-vars");
  });

  it("creates a group with no variables when variables field is absent", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    const template = makeGroupTemplate({ variables: undefined });

    await scaffoldVariableGroup("proj-1", template, PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.variables).toEqual({});
  });

  it("creates a group with no variables when variables is an empty array", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    const template = makeGroupTemplate({ variables: [] });

    await scaffoldVariableGroup("proj-1", template, PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.variables).toEqual({});
  });

  it("defaults description to empty string when not specified in the template", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    const template = makeGroupTemplate({ description: undefined });

    await scaffoldVariableGroup("proj-1", template, PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.description).toBe("");
  });

  // ── Group already exists → skipped ────────────────────────────────────────

  it("returns 'skipped' when a group with the same name already exists", async () => {
    mockCheckVariableGroupExists.mockResolvedValue({ exists: true });
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    const result = await scaffoldVariableGroup("proj-1", makeGroupTemplate(), PARAMS);

    expect(result.status).toBe("skipped");
    expect(result.reason).toMatch(/already exists/i);
    expect(client.addVariableGroup).not.toHaveBeenCalled();
  });

  // ── addVariableGroup failure ───────────────────────────────────────────────

  it("returns 'failed' when addVariableGroup throws", async () => {
    const client = makeTaskAgentClient({ createError: new Error("Quota exceeded") });
    mockGetClient.mockReturnValue(client);

    const result = await scaffoldVariableGroup("proj-1", makeGroupTemplate(), PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/Failed to create variable group/i);
  });

  // ── grantAccessToAllPipelines ─────────────────────────────────────────────

  it("calls the pipeline permissions PATCH when grantAccessToAllPipelines is true", async () => {
    const client = makeTaskAgentClient({ createResult: { id: 99, name: "my-app-vars" } });
    mockGetClient.mockReturnValue(client);

    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    (global as any).fetch = mockFetch;

    await scaffoldVariableGroup("proj-1", makeGroupTemplate({ grantAccessToAllPipelines: true }), PARAMS);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toMatch(/pipelinepermissions\/variablegroup\/99/);
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({
      allPipelines: { authorized: true },
      resource: { id: "99", name: "", type: "variablegroup" },
    });
  });

  it("does not call the pipeline permissions PATCH when grantAccessToAllPipelines is false", async () => {
    const client = makeTaskAgentClient({ createResult: { id: 1 } });
    mockGetClient.mockReturnValue(client);

    const mockFetch = jest.fn();
    (global as any).fetch = mockFetch;

    await scaffoldVariableGroup("proj-1", makeGroupTemplate({ grantAccessToAllPipelines: false }), PARAMS);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not call the pipeline permissions PATCH when grantAccessToAllPipelines is omitted", async () => {
    const client = makeTaskAgentClient({ createResult: { id: 1 } });
    mockGetClient.mockReturnValue(client);

    const mockFetch = jest.fn();
    (global as any).fetch = mockFetch;

    const template = makeGroupTemplate();
    delete (template as Partial<TemplateVariableGroup>).grantAccessToAllPipelines;

    await scaffoldVariableGroup("proj-1", template, PARAMS);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("still returns 'created' when the pipeline authorization PATCH fails (non-fatal)", async () => {
    const client = makeTaskAgentClient({ createResult: { id: 55 } });
    mockGetClient.mockReturnValue(client);

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });

    const result = await scaffoldVariableGroup(
      "proj-1",
      makeGroupTemplate({ grantAccessToAllPipelines: true }),
      PARAMS,
    );

    expect(result.status).toBe("created");
    expect(result.groupId).toBe(55);
  });

  it("passes the rendered group name to checkVariableGroupExists", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    await scaffoldVariableGroup("proj-1", makeGroupTemplate({ name: "{{projectName}}-library" }), PARAMS);

    expect(mockCheckVariableGroupExists).toHaveBeenCalledWith("proj-1", "my-app-library", { fresh: true });
  });

  it("allows empty string values (e.g. for secret placeholders)", async () => {
    const client = makeTaskAgentClient();
    mockGetClient.mockReturnValue(client);

    const template = makeGroupTemplate({
      variables: [{ name: "SECRET_PLACEHOLDER", value: "", secret: true }],
    });

    await scaffoldVariableGroup("proj-1", template, PARAMS);

    const group = client.addVariableGroup.mock.calls[0][0];
    expect(group.variables["SECRET_PLACEHOLDER"]).toEqual({ value: "", isSecret: true });
  });
});
