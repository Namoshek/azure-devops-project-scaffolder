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

jest.mock("../../src/services/variableGroupService", () => ({
  scaffoldVariableGroup: jest.fn(),
}));

import { scaffoldRepository } from "../../src/services/repositoryService";
import { scaffoldPipeline } from "../../src/services/pipelineService";
import { scaffoldServiceConnection } from "../../src/services/serviceConnectionService";
import { scaffoldVariableGroup } from "../../src/services/variableGroupService";

const mockScaffoldRepository = scaffoldRepository as jest.Mock;
const mockScaffoldPipeline = scaffoldPipeline as jest.Mock;
const mockScaffoldServiceConnection = scaffoldServiceConnection as jest.Mock;
const mockScaffoldVariableGroup = scaffoldVariableGroup as jest.Mock;

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
      scaffoldingSteps: [],
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
    const template = makeTemplate({ scaffoldingSteps: [] });
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
      scaffoldingSteps: [
        {
          type: "repository",
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
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
      scaffoldingSteps: [
        {
          type: "repository",
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
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
      scaffoldingSteps: [
        {
          type: "repository",
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toBe("Already exists");
  });

  it("marks a repo step as 'failed' when scaffoldRepository throws", async () => {
    mockScaffoldRepository.mockRejectedValue(new Error("Connection refused"));

    const template = makeTemplate({
      scaffoldingSteps: [
        {
          type: "repository",
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("failed");
    expect(steps[0].detail).toBe("Connection refused");
  });

  it("skips a repo whose 'when' expression evaluates to false", async () => {
    const template = makeTemplate({
      scaffoldingSteps: [
        {
          type: "repository",
          name: "docker-repo",
          sourcePath: "/src",
          defaultBranch: "main",
          when: "includeDocker",
        },
      ],
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
      scaffoldingSteps: [
        {
          type: "repository",
          name: "docker-repo",
          sourcePath: "/src",
          defaultBranch: "main",
          when: "includeDocker",
        },
      ],
    });

    const steps = await runScaffold("proj1", template, { includeDocker: true }, jest.fn());
    expect(steps[0].status).toBe("success");
    expect(mockScaffoldRepository).toHaveBeenCalledTimes(1);
  });

  // ─── Pipeline scaffolding ──────────────────────────────────────────────────

  it("marks a pipeline step as 'success' when scaffoldPipeline returns 'created'", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "my-app-api",
      status: "created",
    });
    mockScaffoldPipeline.mockResolvedValue({
      pipelineName: "my-app-ci",
      status: "created",
      pipelineId: 42,
    });

    const template = makeTemplate({
      scaffoldingSteps: [
        {
          type: "repository",
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
        {
          type: "pipeline",
          name: "{{projectName}}-ci",
          repository: "{{projectName}}-api",
          yamlPath: "azure-pipelines.yml",
        },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[1].status).toBe("success");
  });

  it("marks a pipeline step as 'skipped' when scaffoldPipeline returns 'skipped'", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "api",
      status: "created",
    });
    mockScaffoldPipeline.mockResolvedValue({
      pipelineName: "my-app-ci",
      status: "skipped",
      reason: "Pipeline already exists.",
    });

    const template = makeTemplate({
      scaffoldingSteps: [
        {
          type: "repository",
          name: "api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
        {
          type: "pipeline",
          name: "{{projectName}}-ci",
          repository: "api",
          yamlPath: "azure-pipelines.yml",
        },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[1].status).toBe("skipped");
  });

  it("marks a pipeline step as 'failed' when scaffoldPipeline throws", async () => {
    mockScaffoldRepository.mockResolvedValue({ repoName: "api", status: "created" });
    mockScaffoldPipeline.mockRejectedValue(new Error("API timeout"));

    const template = makeTemplate({
      scaffoldingSteps: [
        { type: "repository", name: "api", sourcePath: "/src", defaultBranch: "main" },
        { type: "pipeline", name: "ci", repository: "api", yamlPath: "azure-pipelines.yml" },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[1].status).toBe("failed");
    expect(steps[1].detail).toBe("API timeout");
  });

  it("skips a pipeline whose 'when' expression evaluates to false", async () => {
    const template = makeTemplate({
      scaffoldingSteps: [
        {
          type: "pipeline",
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

  it("fails a pipeline step when the referenced repository step did not succeed", async () => {
    mockScaffoldRepository.mockRejectedValue(new Error("Repo creation failed"));

    const template = makeTemplate({
      scaffoldingSteps: [
        { type: "repository", name: "api", sourcePath: "/src", defaultBranch: "main" },
        { type: "pipeline", name: "ci", repository: "api", yamlPath: "azure-pipelines.yml" },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("failed");
    expect(steps[1].status).toBe("failed");
    expect(steps[1].detail).toMatch(/Repository 'api' was not created/i);
    expect(mockScaffoldPipeline).not.toHaveBeenCalled();
  });

  // ─── Mixed repos + pipelines ───────────────────────────────────────────────

  it("returns all steps in order (repo then pipeline)", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "api",
      status: "created",
    });
    mockScaffoldPipeline.mockResolvedValue({
      pipelineName: "ci",
      status: "created",
    });

    const template = makeTemplate({
      scaffoldingSteps: [
        { type: "repository", name: "api", sourcePath: "/src", defaultBranch: "main" },
        { type: "pipeline", name: "ci", repository: "api", yamlPath: "azure-pipelines.yml" },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());

    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBe("repository:api");
    expect(steps[1].id).toBe("pipeline:ci");
  });

  // ─── Step label rendering ──────────────────────────────────────────────────

  it("renders Mustache expressions in the step label", async () => {
    mockScaffoldRepository.mockResolvedValue({
      repoName: "my-app-api",
      status: "created",
    });

    const template = makeTemplate({
      scaffoldingSteps: [
        {
          type: "repository",
          name: "{{projectName}}-api",
          sourcePath: "/src",
          defaultBranch: "main",
        },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].label).toBe("Create repository: my-app-api");
  });

  // ─── Service connection scaffolding ────────────────────────────────────────

  // Build a proper step object for service connections
  function makeScStep(overrides: Record<string, unknown> = {}) {
    return {
      type: "serviceConnection" as const,
      name: "Prod-Azure",
      endpointType: "AzureRM",
      authorizationScheme: "ServicePrincipal",
      authorization: { serviceprincipalid: "sp-id", serviceprincipalkey: "sp-key" },
      ...overrides,
    };
  }

  it("marks a service connection step as 'success' when scaffoldServiceConnection returns 'created'", async () => {
    mockScaffoldServiceConnection.mockResolvedValue({
      connectionName: "Prod-Azure",
      status: "created",
      endpointId: "ep-1",
    });

    const template = makeTemplate({
      scaffoldingSteps: [makeScStep()],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("serviceConnection:Prod-Azure");
    expect(steps[0].status).toBe("success");
  });

  it("marks a service connection step as 'skipped' when scaffoldServiceConnection returns 'skipped'", async () => {
    mockScaffoldServiceConnection.mockResolvedValue({
      connectionName: "Prod-Azure",
      status: "skipped",
      reason: "Already exists.",
    });

    const template = makeTemplate({
      scaffoldingSteps: [makeScStep()],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toBe("Already exists.");
  });

  it("marks a service connection step as 'failed' when scaffoldServiceConnection throws", async () => {
    mockScaffoldServiceConnection.mockRejectedValue(new Error("API error"));

    const template = makeTemplate({
      scaffoldingSteps: [makeScStep()],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("failed");
    expect(steps[0].detail).toBe("API error");
  });

  it("skips a service connection whose 'when' expression evaluates to false", async () => {
    const template = makeTemplate({
      scaffoldingSteps: [makeScStep({ when: "includeDocker" })],
    });

    const steps = await runScaffold("proj1", template, { includeDocker: false }, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(mockScaffoldServiceConnection).not.toHaveBeenCalled();
  });

  it("returns all steps in order (repos, service connections, variable groups, pipelines)", async () => {
    mockScaffoldRepository.mockResolvedValue({ repoName: "api", status: "created" });
    mockScaffoldServiceConnection.mockResolvedValue({ connectionName: "Prod-Azure", status: "created" });
    mockScaffoldVariableGroup.mockResolvedValue({ groupName: "Prod-Vars", status: "created" });
    mockScaffoldPipeline.mockResolvedValue({ pipelineName: "ci", status: "created" });

    const template = makeTemplate({
      scaffoldingSteps: [
        { type: "repository", name: "api", sourcePath: "/src", defaultBranch: "main" },
        makeScStep(),
        { type: "variableGroup", name: "Prod-Vars" },
        { type: "pipeline", name: "ci", repository: "api", yamlPath: "azure-pipelines.yml" },
      ],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps).toHaveLength(4);
    expect(steps[0].id).toBe("repository:api");
    expect(steps[1].id).toBe("serviceConnection:Prod-Azure");
    expect(steps[2].id).toBe("variableGroup:Prod-Vars");
    expect(steps[3].id).toBe("pipeline:ci");
  });

  // ─── Variable group scaffolding ────────────────────────────────────────────

  it("marks a variable group step as 'success' when scaffoldVariableGroup returns 'created'", async () => {
    mockScaffoldVariableGroup.mockResolvedValue({ groupName: "Prod-Vars", status: "created" });

    const template = makeTemplate({ scaffoldingSteps: [{ type: "variableGroup", name: "Prod-Vars" }] });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("variableGroup:Prod-Vars");
    expect(steps[0].status).toBe("success");
  });

  it("marks a variable group step as 'skipped' when scaffoldVariableGroup returns 'skipped'", async () => {
    mockScaffoldVariableGroup.mockResolvedValue({
      groupName: "Prod-Vars",
      status: "skipped",
      reason: "Already exists.",
    });

    const template = makeTemplate({ scaffoldingSteps: [{ type: "variableGroup", name: "Prod-Vars" }] });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toBe("Already exists.");
  });

  it("marks a variable group step as 'failed' when scaffoldVariableGroup throws", async () => {
    mockScaffoldVariableGroup.mockRejectedValue(new Error("API error"));

    const template = makeTemplate({ scaffoldingSteps: [{ type: "variableGroup", name: "Prod-Vars" }] });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn());
    expect(steps[0].status).toBe("failed");
    expect(steps[0].detail).toBe("API error");
  });

  it("skips a variable group whose 'when' expression evaluates to false", async () => {
    const template = makeTemplate({
      scaffoldingSteps: [{ type: "variableGroup", name: "docker-vars", when: "includeDocker" }],
    });

    const steps = await runScaffold("proj1", template, { includeDocker: false }, jest.fn());
    expect(steps[0].status).toBe("skipped");
    expect(mockScaffoldVariableGroup).not.toHaveBeenCalled();
  });

  it("processes a variable group whose 'when' expression evaluates to true", async () => {
    mockScaffoldVariableGroup.mockResolvedValue({ groupName: "docker-vars", status: "created" });

    const template = makeTemplate({
      scaffoldingSteps: [{ type: "variableGroup", name: "docker-vars", when: "includeDocker" }],
    });

    const steps = await runScaffold("proj1", template, { includeDocker: true }, jest.fn());
    expect(steps[0].status).toBe("success");
    expect(mockScaffoldVariableGroup).toHaveBeenCalledTimes(1);
  });
});
// ─── Permission-based skipping ────────────────────────────────────────────────

describe("runScaffold — permission skipping", () => {
  const repoStep = {
    type: "repository" as const,
    name: "api",
    sourcePath: "/src",
    defaultBranch: "main",
  };
  const pipelineStep = {
    type: "pipeline" as const,
    name: "ci",
    repository: "api",
    yamlPath: "azure-pipelines.yml",
  };
  const serviceConnectionStep = {
    type: "serviceConnection" as const,
    name: "Prod-Azure",
    endpointType: "AzureRM",
    authorizationScheme: "ServicePrincipal",
    authorization: { serviceprincipalid: "sp-id", serviceprincipalkey: "sp-key" },
  };

  it("skips all repo steps when canCreateRepos is false", async () => {
    const template = makeTemplate({
      scaffoldingSteps: [repoStep],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn(), {
      canCreateRepos: false,
      canCreatePipelines: true,
      canCreateServiceConnections: true,
      canCreateVariableGroups: true,
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
      scaffoldingSteps: [repoStep, pipelineStep],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn(), {
      canCreateRepos: true,
      canCreatePipelines: false,
      canCreateServiceConnections: true,
      canCreateVariableGroups: true,
    });

    const pipelineStepResult = steps.find((s) => s.id.startsWith("pipeline:"));
    expect(pipelineStepResult!.status).toBe("skipped");
    expect(pipelineStepResult!.detail).toMatch(/insufficient permissions/i);
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
      scaffoldingSteps: [repoStep, pipelineStep],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn(), {
      canCreateRepos: true,
      canCreatePipelines: true,
      canCreateServiceConnections: true,
      canCreateVariableGroups: true,
    });

    expect(steps.every((s) => s.status === "success")).toBe(true);
    expect(mockScaffoldRepository).toHaveBeenCalledTimes(1);
    expect(mockScaffoldPipeline).toHaveBeenCalledTimes(1);
  });

  it("still applies when-condition skips inside a permitted phase", async () => {
    const template = makeTemplate({
      scaffoldingSteps: [{ ...repoStep, when: "includeDocker == true" }],
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
      canCreateVariableGroups: true,
    });

    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toMatch(/Condition/);
    expect(mockScaffoldRepository).not.toHaveBeenCalled();
  });

  it("skips all service connection steps when canCreateServiceConnections is false", async () => {
    const template = makeTemplate({
      scaffoldingSteps: [serviceConnectionStep],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn(), {
      canCreateRepos: true,
      canCreatePipelines: true,
      canCreateServiceConnections: false,
      canCreateVariableGroups: true,
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toMatch(/insufficient permissions/i);
    expect(mockScaffoldServiceConnection).not.toHaveBeenCalled();
  });

  it("skips all variable group steps when canCreateVariableGroups is false", async () => {
    const template = makeTemplate({
      scaffoldingSteps: [{ type: "variableGroup", name: "Prod-Vars" }],
    });

    const steps = await runScaffold("proj1", template, PARAMS, jest.fn(), {
      canCreateRepos: true,
      canCreatePipelines: true,
      canCreateServiceConnections: true,
      canCreateVariableGroups: false,
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("skipped");
    expect(steps[0].detail).toMatch(/insufficient permissions/i);
    expect(mockScaffoldVariableGroup).not.toHaveBeenCalled();
  });
});
