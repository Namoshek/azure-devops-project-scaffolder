import { scaffoldPipeline } from "../../src/services/pipelineService";
import type { TemplatePipeline } from "../../src/types/templateTypes";

jest.mock("azure-devops-extension-api", () => ({
  getClient: jest.fn(),
}));

jest.mock("azure-devops-extension-api/Git", () => ({
  GitRestClient: jest.fn(),
}));

jest.mock("azure-devops-extension-api/Build", () => ({
  BuildRestClient: jest.fn(),
  DefinitionType: { Build: 2 },
  YamlProcess: jest.fn(),
  AgentPoolQueue: jest.fn(),
  BuildRepository: jest.fn(),
}));

jest.mock("azure-devops-extension-api/TaskAgent", () => ({
  TaskAgentRestClient: jest.fn(),
}));

jest.mock("../../src/services/preflightCheckService", () => ({
  checkPipelineExists: jest.fn(),
}));

import { getClient } from "azure-devops-extension-api";
import { BuildRestClient } from "azure-devops-extension-api/Build";
import { TaskAgentRestClient } from "azure-devops-extension-api/TaskAgent";
import { checkPipelineExists } from "../../src/services/preflightCheckService";

const mockGetClient = getClient as jest.Mock;
const mockCheckPipelineExists = checkPipelineExists as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePipelineTemplate(overrides: Partial<TemplatePipeline> = {}): TemplatePipeline {
  return {
    name: "{{projectName}}-ci",
    repository: "{{projectName}}-api",
    yamlPath: "azure-pipelines.yml",
    ...overrides,
  };
}

function makeClients(overrides: {
  repos?: { id: string; name: string }[];
  queues?: { id: number; name: string }[];
  createDefinitionResult?: object;
  createDefinitionError?: Error;
}) {
  const gitClient = {
    getRepositories: jest.fn().mockResolvedValue(overrides.repos ?? [{ id: "repo-abc", name: "my-app-api" }]),
  };

  const taskAgentClient = {
    getAgentQueues: jest.fn().mockResolvedValue(overrides.queues ?? [{ id: 1, name: "Default" }]),
  };

  const buildClient = {
    createDefinition: overrides.createDefinitionError
      ? jest.fn().mockRejectedValue(overrides.createDefinitionError)
      : jest.fn().mockResolvedValue(overrides.createDefinitionResult ?? { id: 42, name: "my-app-ci" }),
  };

  // Dispatch by reference — jest.fn() stubs don't have meaningful .name values,
  // so we compare the constructor reference directly.
  mockGetClient.mockImplementation((clientClass: unknown) => {
    if (clientClass === BuildRestClient) return buildClient;
    if (clientClass === TaskAgentRestClient) return taskAgentClient;
    return gitClient; // GitRestClient and any future additions
  });

  return { gitClient, buildClient, taskAgentClient };
}

const PARAMS = { projectName: "my-app" };

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: pipeline does not exist
  mockCheckPipelineExists.mockResolvedValue({ exists: false });
});

describe("scaffoldPipeline", () => {
  // ─── Happy path ────────────────────────────────────────────────────────────

  it("creates a pipeline and returns 'created' with the new pipeline ID", async () => {
    makeClients({ createDefinitionResult: { id: 99, name: "my-app-ci" } });

    const result = await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    expect(result.status).toBe("created");
    expect(result.pipelineName).toBe("my-app-ci");
    expect(result.pipelineId).toBe(99);
  });

  it("renders Handlebars in the pipeline name and repository reference", async () => {
    const { buildClient, gitClient } = makeClients({});

    await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    // Build definition should use the rendered name
    const def = buildClient.createDefinition.mock.calls[0][0];
    expect(def.name).toBe("my-app-ci");

    // Repo lookup should use the rendered repo name
    const reposCall = gitClient.getRepositories.mock.calls[0][0];
    expect(reposCall).toBe("proj1");
  });

  // ─── Pipeline already exists → skipped ────────────────────────────────────

  it("returns 'skipped' when a pipeline with the same name already exists", async () => {
    mockCheckPipelineExists.mockResolvedValue({ exists: true });
    makeClients({});

    const result = await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    expect(result.status).toBe("skipped");
    expect(result.reason).toMatch(/already exists/i);
  });

  // ─── Repository not found → failed ────────────────────────────────────────

  it("returns 'failed' when the target repository is not found", async () => {
    makeClients({ repos: [] }); // no repos

    const result = await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/not found/i);
  });

  it("returns 'failed' when getRepositories throws during repo resolution", async () => {
    // Override gitClient to throw
    const throwingGitClient = {
      getRepositories: jest.fn().mockRejectedValue(new Error("Auth error")),
    };
    mockGetClient.mockImplementation((clientClass: unknown) => {
      if (clientClass === BuildRestClient) {
        return {
          getDefinitions: jest.fn().mockResolvedValue([]),
          createDefinition: jest.fn(),
        };
      }
      if (clientClass === TaskAgentRestClient) {
        return {
          getAgentQueues: jest.fn().mockResolvedValue([{ id: 1, name: "Default" }]),
        };
      }
      return throwingGitClient;
    });

    const result = await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/not found/i);
  });

  // ─── No agent queues → failed ─────────────────────────────────────────────

  it("returns 'failed' when there are no agent queues", async () => {
    makeClients({ queues: [] });

    const result = await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/No agent queues/i);
  });

  it("prefers a queue named 'Default' over others", async () => {
    const { buildClient } = makeClients({
      queues: [
        { id: 10, name: "Other" },
        { id: 20, name: "Default" },
      ],
    });

    await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    const def = buildClient.createDefinition.mock.calls[0][0];
    expect(def.queue.id).toBe(20);
  });

  it("falls back to the first queue when no queue is named 'Default'", async () => {
    const { buildClient } = makeClients({
      queues: [
        { id: 5, name: "Hosted" },
        { id: 6, name: "OnPrem" },
      ],
    });

    await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    const def = buildClient.createDefinition.mock.calls[0][0];
    expect(def.queue.id).toBe(5);
  });

  // ─── createDefinition failure ──────────────────────────────────────────────

  it("returns 'failed' when createDefinition throws", async () => {
    makeClients({ createDefinitionError: new Error("Quota exceeded") });

    const result = await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/Failed to create pipeline/i);
  });

  // ─── Pipeline folder ───────────────────────────────────────────────────────

  it("defaults the pipeline folder to '\\'", async () => {
    const { buildClient } = makeClients({});

    await scaffoldPipeline("proj1", makePipelineTemplate(), PARAMS);

    const def = buildClient.createDefinition.mock.calls[0][0];
    expect(def.path).toBe("\\");
  });

  it("uses a custom folder when specified in the template", async () => {
    const { buildClient } = makeClients({});

    await scaffoldPipeline("proj1", makePipelineTemplate({ folder: "\\BackendPipelines" }), PARAMS);

    const def = buildClient.createDefinition.mock.calls[0][0];
    expect(def.path).toBe("\\BackendPipelines");
  });
});
