import {
  checkRepoExists,
  checkPipelineExists,
  checkServiceConnectionExists,
  checkTemplateResourcesExistence,
} from "../../src/services/preflightCheckService";
import type { TemplateDefinition } from "../../src/types/templateTypes";

jest.mock("azure-devops-extension-api", () => ({
  getClient: jest.fn(),
}));

jest.mock("azure-devops-extension-api/Git", () => ({
  GitRestClient: jest.fn(),
}));

jest.mock("azure-devops-extension-api/Build", () => ({
  BuildRestClient: jest.fn(),
}));

jest.mock("azure-devops-extension-api/ServiceEndpoint", () => ({
  ServiceEndpointRestClient: jest.fn(),
}));

import { getClient } from "azure-devops-extension-api";
import { BuildRestClient } from "azure-devops-extension-api/Build";
import { ServiceEndpointRestClient } from "azure-devops-extension-api/ServiceEndpoint";

const mockGetClient = getClient as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGitClient(
  overrides: {
    repos?: { id: string; name: string }[];
    refs?: { name: string }[];
    refsError?: Error;
  } = {},
) {
  return {
    getRepositories: jest.fn().mockResolvedValue(overrides.repos ?? []),
    getRefs: overrides.refsError
      ? jest.fn().mockRejectedValue(overrides.refsError)
      : jest.fn().mockResolvedValue(overrides.refs ?? []),
  };
}

function makeBuildClient(
  overrides: {
    definitions?: { id: number; name: string; path?: string }[];
  } = {},
) {
  const defs = overrides.definitions ?? [];
  return {
    // Mirror ADO behaviour: filter definitions by the name and path arguments.
    getDefinitions: jest
      .fn()
      .mockImplementation(
        (
          _projectId: string,
          name?: string,
          _repositoryId?: string,
          _repositoryType?: string,
          _queryOrder?: unknown,
          _top?: unknown,
          _continuationToken?: string,
          _minMetricsTime?: unknown,
          _definitionIds?: unknown,
          path?: string,
        ) => {
          let filtered = defs;
          if (name) filtered = filtered.filter((d) => d.name === name);
          if (path) filtered = filtered.filter((d) => (d.path ?? "\\") === path);
          return Promise.resolve(filtered);
        },
      ),
  };
}

function makeServiceEndpointClient(overrides: { endpoints?: { id: string; name: string }[]; error?: Error } = {}) {
  const eps = overrides.endpoints ?? [];
  return {
    getServiceEndpointsByNames: overrides.error
      ? jest.fn().mockRejectedValue(overrides.error)
      : jest
          .fn()
          .mockImplementation((_projectId: string, names: string[]) =>
            Promise.resolve(eps.filter((e) => names.some((n) => n.toLowerCase() === e.name.toLowerCase()))),
          ),
  };
}

function setupClients(
  gitClient: ReturnType<typeof makeGitClient>,
  buildClient: ReturnType<typeof makeBuildClient>,
  endpointClient: ReturnType<typeof makeServiceEndpointClient> = makeServiceEndpointClient(),
) {
  mockGetClient.mockImplementation((clientClass: unknown) => {
    if (clientClass === BuildRestClient) return buildClient;
    if (clientClass === ServiceEndpointRestClient) return endpointClient;
    return gitClient;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── checkRepoExists ──────────────────────────────────────────────────────────

describe("checkRepoExists", () => {
  it("returns { exists: false, isNonEmpty: false } when the repo does not exist", async () => {
    const git = makeGitClient({ repos: [] });
    setupClients(git, makeBuildClient());

    const result = await checkRepoExists("proj-a1", "new-repo");

    expect(result).toEqual({ exists: false, isNonEmpty: false });
  });

  it("returns { exists: true, isNonEmpty: true } when repo exists with refs", async () => {
    const git = makeGitClient({
      repos: [{ id: "repo-1", name: "backend" }],
      refs: [{ name: "refs/heads/main" }],
    });
    setupClients(git, makeBuildClient());

    const result = await checkRepoExists("proj-a2", "backend");

    expect(result).toEqual({ exists: true, isNonEmpty: true });
  });

  it("returns { exists: true, isNonEmpty: false } when repo exists but has no refs", async () => {
    const git = makeGitClient({
      repos: [{ id: "repo-empty", name: "empty-repo" }],
      refs: [],
    });
    setupClients(git, makeBuildClient());

    const result = await checkRepoExists("proj-a3", "empty-repo");

    expect(result).toEqual({ exists: true, isNonEmpty: false });
  });

  it("treats the repo as empty when getRefs throws", async () => {
    const git = makeGitClient({
      repos: [{ id: "repo-refs-err", name: "error-repo" }],
      refsError: new Error("Permission denied"),
    });
    setupClients(git, makeBuildClient());

    const result = await checkRepoExists("proj-a4", "error-repo");

    // refs failure → treat as empty, not non-existent
    expect(result).toEqual({ exists: true, isNonEmpty: false });
  });

  it("fails open and returns { exists: false, isNonEmpty: false } when getRepositories throws", async () => {
    const git = {
      getRepositories: jest.fn().mockRejectedValue(new Error("Network error")),
      getRefs: jest.fn(),
    };
    setupClients(git as any, makeBuildClient());

    const result = await checkRepoExists("proj-a5", "any-repo");

    expect(result).toEqual({ exists: false, isNonEmpty: false });
  });

  it("is case-insensitive when matching repo names", async () => {
    const git = makeGitClient({
      repos: [{ id: "repo-case", name: "MyRepo" }],
      refs: [{ name: "refs/heads/main" }],
    });
    setupClients(git, makeBuildClient());

    const result = await checkRepoExists("proj-a6", "myrepo");

    expect(result.exists).toBe(true);
  });

  // ── Cache behaviour ──────────────────────────────────────────────────────────

  it("returns a cached result on the second call without hitting the API", async () => {
    const git = makeGitClient({ repos: [] });
    setupClients(git, makeBuildClient());

    // First call — populates the cache
    await checkRepoExists("proj-cache1", "cached-repo");
    // Second call — should use cache
    await checkRepoExists("proj-cache1", "cached-repo");

    expect(git.getRepositories).toHaveBeenCalledTimes(1);
  });

  it("bypasses the read cache when fresh: true is passed", async () => {
    const git = makeGitClient({ repos: [] });
    setupClients(git, makeBuildClient());

    // Populate cache
    await checkRepoExists("proj-cache2", "fresh-repo");
    // Force fresh
    await checkRepoExists("proj-cache2", "fresh-repo", { fresh: true });

    expect(git.getRepositories).toHaveBeenCalledTimes(2);
  });

  it("writes a fresh result back into the cache so subsequent preview calls benefit", async () => {
    const git = makeGitClient({ repos: [] });
    setupClients(git, makeBuildClient());

    // First call with fresh (simulates scaffolding mid-flow)
    await checkRepoExists("proj-cache3", "write-back-repo", { fresh: true });
    // Second call without fresh — should use the cache entry written by the first call
    await checkRepoExists("proj-cache3", "write-back-repo");

    expect(git.getRepositories).toHaveBeenCalledTimes(1);
  });
});

// ─── checkPipelineExists ──────────────────────────────────────────────────────

describe("checkPipelineExists", () => {
  it("returns { exists: false } when no pipeline matches", async () => {
    const build = makeBuildClient({ definitions: [] });
    setupClients(makeGitClient(), build);

    const result = await checkPipelineExists("proj-b1", "ci-pipeline");

    expect(result).toEqual({ exists: false });
  });

  it("returns { exists: true } when a matching pipeline exists in the same folder", async () => {
    const build = makeBuildClient({
      definitions: [{ id: 1, name: "ci-pipeline", path: "\\" }],
    });
    setupClients(makeGitClient(), build);

    const result = await checkPipelineExists("proj-b2", "ci-pipeline", "\\");

    expect(result).toEqual({ exists: true });
  });

  it("returns { exists: false } when a pipeline with the same name exists only in a different folder", async () => {
    const build = makeBuildClient({
      definitions: [{ id: 1, name: "ci-pipeline", path: "\\TeamA" }],
    });
    setupClients(makeGitClient(), build);

    // Looking for the same pipeline in the root folder — should not match \TeamA
    const result = await checkPipelineExists("proj-b3", "ci-pipeline", "\\");

    expect(result).toEqual({ exists: false });
  });

  it("passes the folder as the path argument to getDefinitions", async () => {
    const build = makeBuildClient({ definitions: [] });
    setupClients(makeGitClient(), build);

    await checkPipelineExists("proj-b4", "my-pipe", "\\Team");

    // path is the 10th positional argument (index 9)
    const callArgs = build.getDefinitions.mock.calls[0];
    expect(callArgs[1]).toBe("my-pipe"); // name
    expect(callArgs[9]).toBe("\\Team"); // path/folder
  });

  it("fails open and returns { exists: false } when getDefinitions throws", async () => {
    const build = {
      getDefinitions: jest.fn().mockRejectedValue(new Error("Timeout")),
    };
    setupClients(makeGitClient(), build as any);

    const result = await checkPipelineExists("proj-b5", "some-pipeline");

    expect(result).toEqual({ exists: false });
  });

  it("returns a cached result on the second call without hitting the API", async () => {
    const build = makeBuildClient({ definitions: [] });
    setupClients(makeGitClient(), build);

    await checkPipelineExists("proj-cache4", "cached-pipeline");
    await checkPipelineExists("proj-cache4", "cached-pipeline");

    expect(build.getDefinitions).toHaveBeenCalledTimes(1);
  });

  it("bypasses the read cache when fresh: true is passed", async () => {
    const build = makeBuildClient({ definitions: [] });
    setupClients(makeGitClient(), build);

    await checkPipelineExists("proj-cache5", "fresh-pipe");
    await checkPipelineExists("proj-cache5", "fresh-pipe", "\\", {
      fresh: true,
    });

    expect(build.getDefinitions).toHaveBeenCalledTimes(2);
  });

  it("treats the same name in different folders as separate cache entries", async () => {
    const build = makeBuildClient({ definitions: [] });
    setupClients(makeGitClient(), build);

    await checkPipelineExists("proj-cache6", "shared-name", "\\");
    await checkPipelineExists("proj-cache6", "shared-name", "\\TeamA");

    // Different folders → different cache keys → two distinct API calls
    expect(build.getDefinitions).toHaveBeenCalledTimes(2);
  });
});

// ─── checkServiceConnectionExists ────────────────────────────────────────────

describe("checkServiceConnectionExists", () => {
  it("returns { exists: false } when no connection with that name exists", async () => {
    const ep = makeServiceEndpointClient({ endpoints: [] });
    setupClients(makeGitClient(), makeBuildClient(), ep);

    const result = await checkServiceConnectionExists("proj-sc1", "my-connection");

    expect(result).toEqual({ exists: false });
  });

  it("returns { exists: true } when a connection with that name exists", async () => {
    const ep = makeServiceEndpointClient({
      endpoints: [{ id: "ep-1", name: "my-connection" }],
    });
    setupClients(makeGitClient(), makeBuildClient(), ep);

    const result = await checkServiceConnectionExists("proj-sc2", "my-connection");

    expect(result).toEqual({ exists: true });
  });

  it("fails open and returns { exists: false } when getServiceEndpointsByNames throws", async () => {
    const ep = makeServiceEndpointClient({ error: new Error("Server error") });
    setupClients(makeGitClient(), makeBuildClient(), ep);

    const result = await checkServiceConnectionExists("proj-sc3", "broken-connection");

    expect(result).toEqual({ exists: false });
  });

  it("returns a cached result on the second call without hitting the API", async () => {
    const ep = makeServiceEndpointClient({ endpoints: [] });
    setupClients(makeGitClient(), makeBuildClient(), ep);

    await checkServiceConnectionExists("proj-sc-cache1", "cached-conn");
    await checkServiceConnectionExists("proj-sc-cache1", "cached-conn");

    expect(ep.getServiceEndpointsByNames).toHaveBeenCalledTimes(1);
  });

  it("bypasses the read cache when fresh: true is passed", async () => {
    const ep = makeServiceEndpointClient({ endpoints: [] });
    setupClients(makeGitClient(), makeBuildClient(), ep);

    await checkServiceConnectionExists("proj-sc-cache2", "fresh-conn");
    await checkServiceConnectionExists("proj-sc-cache2", "fresh-conn", { fresh: true });

    expect(ep.getServiceEndpointsByNames).toHaveBeenCalledTimes(2);
  });

  it("passes the connection name to getServiceEndpointsByNames", async () => {
    const ep = makeServiceEndpointClient({ endpoints: [] });
    setupClients(makeGitClient(), makeBuildClient(), ep);

    await checkServiceConnectionExists("proj-sc-name", "azure-prod");

    expect(ep.getServiceEndpointsByNames).toHaveBeenCalledWith("proj-sc-name", ["azure-prod"]);
  });
});

// ─── checkTemplateResourcesExistence ─────────────────────────────────────────

describe("checkTemplateResourcesExistence", () => {
  function makeTemplate(
    repos: string[],
    pipelines: { name: string; folder?: string }[],
    serviceConnections: string[] = [],
  ): TemplateDefinition {
    return {
      id: "tpl-1",
      name: "Test",
      version: "1.0.0",
      parameters: [],
      repositories: repos.map((name) => ({
        name,
        sourcePath: "/templates/x",
        defaultBranch: "main",
      })),
      pipelines: pipelines.map(({ name, folder }) => ({
        name,
        repository: "repo",
        yamlPath: "azure-pipelines.yml",
        ...(folder !== undefined ? { folder } : {}),
      })),
      serviceConnections: serviceConnections.map((name) => ({
        name,
        type: "AzureRM",
        authorizationScheme: "ServicePrincipal",
        authorization: {},
      })),
    };
  }

  it("returns empty maps when template has no repos or pipelines", async () => {
    setupClients(makeGitClient(), makeBuildClient());

    const result = await checkTemplateResourcesExistence("proj-c1", makeTemplate([], []), {});

    expect(result.repos).toEqual({});
    expect(result.pipelines).toEqual({});
    expect(result.serviceConnections).toEqual({});
  });

  it("checks all repos and pipelines in parallel and returns a map keyed correctly", async () => {
    const git = makeGitClient({
      repos: [{ id: "r1", name: "Frontend" }],
      refs: [{ name: "refs/heads/main" }],
    });
    const build = makeBuildClient({
      definitions: [{ id: 1, name: "Frontend-CI", path: "\\" }],
    });
    setupClients(git, build);

    const template = makeTemplate(
      ["Frontend", "Backend"],
      [
        { name: "Frontend-CI" }, // no folder → defaults to \\
        { name: "Backend-CI" },
      ],
    );
    const result = await checkTemplateResourcesExistence("proj-c2", template, {});

    expect(result.repos["frontend"]).toEqual({
      exists: true,
      isNonEmpty: true,
    });
    expect(result.repos["backend"]).toEqual({
      exists: false,
      isNonEmpty: false,
    });
    // Default folder is \\ → key = "\\::frontend-ci"
    expect(result.pipelines["\\::frontend-ci"]).toEqual({ exists: true });
    expect(result.pipelines["\\::backend-ci"]).toEqual({ exists: false });
  });

  it("scopes the pipeline key by folder so different folders are distinct entries", async () => {
    const build = makeBuildClient({
      definitions: [
        { id: 1, name: "CI", path: "\\TeamA" },
        { id: 2, name: "CI", path: "\\TeamB" },
      ],
    });
    setupClients(makeGitClient(), build);

    const template = makeTemplate(
      [],
      [
        { name: "CI", folder: "\\TeamA" },
        { name: "CI", folder: "\\TeamB" },
        { name: "CI", folder: "\\TeamC" },
      ],
    );
    const result = await checkTemplateResourcesExistence("proj-c4", template, {});

    expect(result.pipelines["\\teama::ci"]).toEqual({ exists: true });
    expect(result.pipelines["\\teamb::ci"]).toEqual({ exists: true });
    expect(result.pipelines["\\teamc::ci"]).toEqual({ exists: false });
  });

  it("includes service connection existence results keyed by lowercased name", async () => {
    const ep = makeServiceEndpointClient({
      endpoints: [{ id: "ep-1", name: "Prod-Azure" }],
    });
    setupClients(makeGitClient(), makeBuildClient(), ep);

    const template = makeTemplate([], [], ["Prod-Azure", "Staging-Azure"]);
    const result = await checkTemplateResourcesExistence("proj-c5", template, {});

    expect(result.serviceConnections["prod-azure"]).toEqual({ exists: true });
    expect(result.serviceConnections["staging-azure"]).toEqual({ exists: false });
  });

  it("renders Mustache in service connection names before checking", async () => {
    const ep = makeServiceEndpointClient({ endpoints: [] });
    setupClients(makeGitClient(), makeBuildClient(), ep);

    const template = makeTemplate([], [], ["{{projectName}}-azure"]);
    const result = await checkTemplateResourcesExistence("proj-c6", template, { projectName: "my-svc" });

    expect(result.serviceConnections["my-svc-azure"]).toEqual({ exists: false });
    expect(ep.getServiceEndpointsByNames).toHaveBeenCalledWith("proj-c6", ["my-svc-azure"]);
  });

  it("renders Mustache expressions in repo names before checking", async () => {
    const git = makeGitClient({
      repos: [{ id: "r2", name: "my-app-backend" }],
      refs: [{ name: "refs/heads/main" }],
    });
    setupClients(git, makeBuildClient());

    const template = makeTemplate(["{{projectName}}-backend"], []);
    const result = await checkTemplateResourcesExistence("proj-c3", template, {
      projectName: "my-app",
    });

    expect(result.repos["my-app-backend"]).toEqual({
      exists: true,
      isNonEmpty: true,
    });
  });
});
