import { runScaffold } from "../../src/services/scaffoldingOrchestrator";
import type { DiscoveredTemplate, TemplateDefinition } from "../../src/types/templateTypes";

jest.mock("../../src/services/repositoryService", () => ({
  scaffoldRepository: jest.fn(),
}));

jest.mock("../../src/services/pipelineService", () => ({
  scaffoldPipeline: jest.fn(),
}));

jest.mock("../../src/services/serviceConnectionService", () => ({
  scaffoldServiceConnection: jest.fn(),
}));

import { scaffoldRepository } from "../../src/services/repositoryService";
import { scaffoldPipeline } from "../../src/services/pipelineService";
import { scaffoldServiceConnection } from "../../src/services/serviceConnectionService";

const mockScaffoldRepository = scaffoldRepository as jest.Mock;
const mockScaffoldPipeline = scaffoldPipeline as jest.Mock;
const mockScaffoldServiceConnection = scaffoldServiceConnection as jest.Mock;

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<TemplateDefinition> = {}): DiscoveredTemplate {
  return {
    sourceProjectId: "src-proj",
    sourceRepoId: "src-repo",
    sourceProjectName: "Source Project",
    sourceRepoName: "Source Repo",
    definition: {
      id: "tpl-1",
      name: "Test Template",
      version: "1.0.0",
      parameters: [],
      repositories: [],
      pipelines: [],
      serviceConnections: [],
      ...overrides,
    },
  };
}

const PARAMS = { projectName: "my-app", includeDocker: true };

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runScaffold", () => {
  // ─── No steps ──────────────────────────────────────────────────────────────

  it("returns an empty steps array when there are no repos or pipelines", async () => {
    const template = makeTemplate({ repositories: [], pipelines: [] });
    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps).toHaveLength(0);
  });

  // ─── Progress callback ─────────────────────────────────────────────────────

  it("calls the progress callback multiple times as a step progresses", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "my-app-api",
      status: "created",
    });

    const template = makeTemplate({
      repositories: [
        {
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
      pipelines: [],
    });

    const onProgress = jest.fn();
    await runScaffold("proj1", template, PARAMS, onProgress);

    // Initial (pending) + running + final (success) → at least 3 calls
    expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(3);
    // The final progress snapshot should show the step as success
    const lastSteps = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
    expect(lastSteps[0].status).toBe("success");
  });

  // ─── Repository scaffolding ─────────────────────────────────────────────────

  it("marks a repo step as 'success' when scaffoldRepository returns 'created'", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "my-app-api",
      status: "created",
    });

    const template = makeTemplate({
      repositories: [
        {
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("success");
  });

  it("marks a repo step as 'skipped' when scaffoldRepository returns 'skipped'", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "my-app-api",
      status: "skipped",
      reason: "Already exists",
    });

    const template = makeTemplate({
      repositories: [
        {
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toBe("Already exists");
  });

  it("marks a repo step as 'failed' when scaffoldRepository throws", async () => {
    mockScaffoldRepository.mockRejectedValue(new Error("Connection refused"));

    const template = makeTemplate({
      repositories: [
        {
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("failed");
    expect(steps[0].detail).toBe("Connection refused");
  });

  it("skips a repo whose 'when' expression evaluates to false", async () => {
    const template = makeTemplate({
      repositories: [
        {
          name: "docker-repo",
          sourcePath: "/src",
          defaultBranch: "main",
          when: "includeDocker",
        },
      ],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, { includeDocker: false }, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(mockScaffoldRepository).not.toHaveBeenCalled();
  });

  it("processes a repo whose 'when' expression evaluates to true", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "docker-repo",
      status: "created",
    });

    const template = makeTemplate({
      repositories: [
        {
          name: "docker-repo",
          sourcePath: "/src",
          defaultBranch: "main",
          when: "includeDocker",
        },
      ],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, { includeDocker: true }, jest.fn());
    expect(steps[0].status).toBe("success");
    expect(mockScaffoldRepository).toHaveBeenCalledTimes(1);
  });

  // ─── Pipeline scaffolding ──────────────────────────────────────────────────

  it("marks a pipeline step as 'success' when scaffoldPipeline returns 'created'", async () => {
    mockScaffoldPipeline.mockResolvedValue({
      pipelineName: "my-app-ci",
      status: "created",
      pipelineId: 42,
    });

    const template = makeTemplate({
      repositories: [],
      pipelines: [
        {
          name: "{{projectName}}-ci",
          repository: "{{projectName}}-api",
          yamlPath: "azure-pipelines.yml",
        },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("success");
  });

  it("marks a pipeline step as 'skipped' when scaffoldPipeline returns 'skipped'", async () => {
    mockScaffoldPipeline.mockResolvedValue({
      pipelineName: "my-app-ci",
      status: "skipped",
      reason: "Pipeline already exists.",
    });

    const template = makeTemplate({
      repositories: [],
      pipelines: [
        {
          name: "{{projectName}}-ci",
          repository: "api",
          yamlPath: "azure-pipelines.yml",
        },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("skipped");
  });

  it("marks a pipeline step as 'failed' when scaffoldPipeline throws", async () => {
    mockScaffoldPipeline.mockRejectedValue(new Error("API timeout"));

    const template = makeTemplate({
      repositories: [],
      pipelines: [{ name: "ci", repository: "api", yamlPath: "azure-pipelines.yml" }],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("failed");
    expect(steps[0].detail).toBe("API timeout");
  });

  it("skips a pipeline whose 'when' expression evaluates to false", async () => {
    const template = makeTemplate({
      repositories: [],
      pipelines: [
        {
          name: "ci",
          repository: "api",
          yamlPath: "azure-pipelines.yml",
          when: "includeDocker",
        },
      ],
    });

    const steps = await runScaffold("proj1", template, { includeDocker: false }, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(mockScaffoldPipeline).not.toHaveBeenCalled();
  });

  // ─── Mixed repos + pipelines ───────────────────────────────────────────────

  it("returns all steps in order (repos first, then pipelines)", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "api",
      status: "created",
    });
    mockScaffoldPipeline.mockResolvedValue({
      pipelineName: "ci",
      status: "created",
    });

    const template = makeTemplate({
      repositories: [{ name: "api", sourcePath: "/src", defaultBranch: "main" }],
      pipelines: [{ name: "ci", repository: "api", yamlPath: "azure-pipelines.yml" }],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());

    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBe("repo:api");
    expect(steps[1].id).toBe("pipeline:ci");
  });

  it("continues pipeline phase even if a repo step failed", async () => {
    mockScaffoldRepository.mockRejectedValue(new Error("Repo creation failed"));
    mockScaffoldPipeline.mockResolvedValue({
      pipelineName: "ci",
      status: "created",
    });

    const template = makeTemplate({
      repositories: [{ name: "api", sourcePath: "/src", defaultBranch: "main" }],
      pipelines: [{ name: "ci", repository: "api", yamlPath: "azure-pipelines.yml" }],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());

    expect(steps[0].status).toBe("failed");
    expect(steps[1].status).toBe("success");
  });

  // ─── Step label rendering ──────────────────────────────────────────────────

  it("renders Mustache expressions in the step label", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "my-app-api",
      status: "created",
    });

    const template = makeTemplate({
      repositories: [
        {
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].label).toBe("Create repository: my-app-api");
  });

  // ─── Service connection scaffolding ────────────────────────────────────────

  const scTemplate = {
    name: "Prod-Azure",
    type: "AzureRM",
    authorizationScheme: "ServicePrincipal",
    authorization: { serviceprincipalid: "sp-id", serviceprincipalkey: "sp-key" },
  };

  it("marks a service connection step as 'success' when scaffoldServiceConnection returns 'created'", async () => {
    mockScaffoldServiceConnection.mockResolvedValue({
      connectionName: "Prod-Azure",
      status: "created",
      endpointId: "ep-1",
    });

    const template = makeTemplate({
      repositories: [],
      serviceConnections: [scTemplate],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("serviceconnection:Prod-Azure");
    expect(steps[0].status).toBe("success");
  });

  it("marks a service connection step as 'skipped' when scaffoldServiceConnection returns 'skipped'", async () => {
    mockScaffoldServiceConnection.mockResolvedValue({
      connectionName: "Prod-Azure",
      status: "skipped",
      reason: "Already exists.",
    });

    const template = makeTemplate({
      repositories: [],
      serviceConnections: [scTemplate],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toBe("Already exists.");
  });

  it("marks a service connection step as 'failed' when scaffoldServiceConnection throws", async () => {
    mockScaffoldServiceConnection.mockRejectedValue(new Error("API error"));

    const template = makeTemplate({
      repositories: [],
      serviceConnections: [scTemplate],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("failed");
    expect(steps[0].detail).toBe("API error");
  });

  it("skips a service connection whose 'when' expression evaluates to false", async () => {
    const template = makeTemplate({
      repositories: [],
      serviceConnections: [{ ...scTemplate, when: "includeDocker" }],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, { includeDocker: false }, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(mockScaffoldServiceConnection).not.toHaveBeenCalled();
  });

  it("returns all steps in order (repos, service connections, pipelines)", async () => {
    mockScaffoldRepository.mockResolvedValue({ repoName: "api", status: "created" });
    mockScaffoldServiceConnection.mockResolvedValue({ connectionName: "Prod-Azure", status: "created" });
    mockScaffoldPipeline.mockResolvedValue({ pipelineName: "ci", status: "created" });

    const template = makeTemplate({
      repositories: [{ name: "api", sourcePath: "/src", defaultBranch: "main" }],
      serviceConnections: [scTemplate],
      pipelines: [{ name: "ci", repository: "api", yamlPath: "azure-pipelines.yml" }],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps).toHaveLength(3);
    expect(steps[0].id).toBe("repo:api");
    expect(steps[1].id).toBe("serviceconnection:Prod-Azure");
    expect(steps[2].id).toBe("pipeline:ci");
  });
});
// ─── Permission-based skipping ────────────────────────────────────────────────

describe("runScaffold — permission skipping", () => {
  const repoTemplate = {
    name: "api",
    sourcePath: "/src",
    defaultBranch: "main",
  };
  const pipelineTemplate = {
    name: "ci",
    repository: "api",
    yamlPath: "azure-pipelines.yml",
  };
  const serviceConnectionTemplate = {
    name: "Prod-Azure",
    type: "AzureRM",
    authorizationScheme: "ServicePrincipal",
    authorization: { serviceprincipalid: "sp-id", serviceprincipalkey: "sp-key" },
  };

  it("skips all repo steps when canCreateRepos is false", async () => {
    const template = makeTemplate({
      repositories: [repoTemplate],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn(), {
      canCreateRepos: false,
      canCreatePipelines: true,
      canCreateServiceConnections: true,
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toMatch(/insufficient permissions/i);
    expect(mockScaffoldRepository).not.toHaveBeenCalled();
  });

  it("skips all pipeline steps when canCreatePipelines is false", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "api",
      status: "created",
    });

    const template = makeTemplate({
      repositories: [repoTemplate],
      pipelines: [pipelineTemplate],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn(), {
      canCreateRepos: true,
      canCreatePipelines: false,
      canCreateServiceConnections: true,
    });

    const pipelineStep = steps.find((s) => s.id.startsWith("pipeline:"));
    expect(pipelineStep!.status).toBe("skipped");
    expect(pipelineStep!.detail).toMatch(/insufficient permissions/i);
    expect(mockScaffoldPipeline).not.toHaveBeenCalled();
  });

  it("runs both phases normally when both permissions are true", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "api",
      status: "created",
    });
    mockScaffoldPipeline.mockResolvedValue({
      pipelineName: "ci",
      status: "created",
    });

    const template = makeTemplate({
      repositories: [repoTemplate],
      pipelines: [pipelineTemplate],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn(), {
      canCreateRepos: true,
      canCreatePipelines: true,
      canCreateServiceConnections: true,
    });

    expect(steps.every((s) => s.status === "success")).toBe(true);
    expect(mockScaffoldRepository).toHaveBeenCalledTimes(1);
    expect(mockScaffoldPipeline).toHaveBeenCalledTimes(1);
  });

  it("still applies when-condition skips inside a permitted phase", async () => {
    const template = makeTemplate({
      repositories: [{ ...repoTemplate, when: "includeDocker == true" }],
      pipelines: [],
    });

    // canCreateRepos is true, but the when condition should still cause a skip
    mockScaffoldRepository.mockResolvedValue({
      repoName: "api",
      status: "created",
    });

    const steps = await runScaffold("proj1", template, { includeDocker: false }, jest.fn(), {
      canCreateRepos: true,
      canCreatePipelines: true,
      canCreateServiceConnections: true,
    });

    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toMatch(/Condition/);
    expect(mockScaffoldRepository).not.toHaveBeenCalled();
  });

  it("skips all service connection steps when canCreateServiceConnections is false", async () => {
    const template = makeTemplate({
      repositories: [],
      serviceConnections: [serviceConnectionTemplate],
      pipelines: [],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn(), {
      canCreateRepos: true,
      canCreatePipelines: true,
      canCreateServiceConnections: false,
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toMatch(/insufficient permissions/i);
    expect(mockScaffoldServiceConnection).not.toHaveBeenCalled();
  });
});
