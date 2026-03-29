import { scaffoldRepository } from "../../src/services/repositoryService";
import type { TemplateRepository } from "../../src/types/templateTypes";

jest.mock("azure-devops-extension-api", () => ({
  getClient: jest.fn(),
}));

jest.mock("azure-devops-extension-api/Git", () => ({
  GitRestClient: jest.fn(),
  VersionControlRecursionType: { Full: 120 },
  VersionControlChangeType: { Add: 1 },
  ItemContentType: { RawText: 0, Base64Encoded: 1 },
}));

jest.mock("../../src/services/templateReaderService", () => ({
  fetchTemplateFiles: jest.fn(),
}));

jest.mock("../../src/services/preflightCheckService", () => ({
  checkRepoExists: jest.fn(),
}));

import { getClient } from "azure-devops-extension-api";
import { fetchTemplateFiles } from "../../src/services/templateReaderService";
import { checkRepoExists } from "../../src/services/preflightCheckService";

const mockGetClient = getClient as jest.Mock;
const mockFetchTemplateFiles = fetchTemplateFiles as jest.Mock;
const mockCheckRepoExists = checkRepoExists as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRepoTemplate(overrides: Partial<TemplateRepository> = {}): TemplateRepository {
  return {
    name: "{{projectName}}-api",
    sourcePath: "/templates/api",
    defaultBranch: "main",
    ...overrides,
  };
}

function makeGitClient(
  overrides: Partial<{
    getRepositories: jest.Mock;
    createRepository: jest.Mock;
    createPush: jest.Mock;
  }> = {},
) {
  return {
    getRepositories: overrides.getRepositories ?? jest.fn().mockResolvedValue([]),
    createRepository: overrides.createRepository ?? jest.fn().mockResolvedValue({ id: "new-repo-id" }),
    createPush: overrides.createPush ?? jest.fn().mockResolvedValue({}),
  };
}

const PARAMS = { projectName: "my-app" };

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Default: repo does not exist
  mockCheckRepoExists.mockResolvedValue({ exists: false, isNonEmpty: false });
});

describe("scaffoldRepository", () => {
  // ─── Happy path: new repo ──────────────────────────────────────────────────

  it("creates a new repository and pushes files", async () => {
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([
      {
        path: "/templates/api/README.md",
        content: "# {{projectName}}",
        isBase64: false,
      },
    ]);

    const result = await scaffoldRepository("proj1", makeRepoTemplate(), "src-proj", "src-repo", PARAMS);

    expect(result.status).toBe("created");
    expect(result.repoName).toBe("my-app-api");
    expect(gitClient.createRepository).toHaveBeenCalledWith(expect.objectContaining({ name: "my-app-api" }), "proj1");
    expect(gitClient.createPush).toHaveBeenCalledTimes(1);
  });

  it("renders Mustache expressions in file content before pushing", async () => {
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([
      {
        path: "/templates/api/README.md",
        content: "Hello {{projectName}}",
        isBase64: false,
      },
    ]);

    await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    const pushCall = gitClient.createPush.mock.calls[0][0];
    const change = pushCall.commits[0].changes[0];
    expect(change.newContent.content).toBe("Hello my-app");
  });

  it("renders Mustache expressions in file paths", async () => {
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([
      {
        path: "/templates/api/src/{{projectName}}/index.ts",
        content: "export {};",
        isBase64: false,
      },
    ]);

    await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    const pushCall = gitClient.createPush.mock.calls[0][0];
    const change = pushCall.commits[0].changes[0];
    expect(change.item.path).toBe("/src/my-app/index.ts");
  });

  it("does not render Mustache in base64-encoded (binary) file content", async () => {
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([
      {
        path: "/templates/api/logo.png",
        content: "base64data==",
        isBase64: true,
      },
    ]);

    await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    const pushCall = gitClient.createPush.mock.calls[0][0];
    const change = pushCall.commits[0].changes[0];
    expect(change.newContent.content).toBe("base64data==");
  });

  // ─── project-template.yml exclusion ───────────────────────────────────────

  it("excludes project-template.yml from the push", async () => {
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([
      {
        path: "/templates/api/project-template.yml",
        content: "id: x",
        isBase64: false,
      },
      {
        path: "/templates/api/README.md",
        content: "# Readme",
        isBase64: false,
      },
    ]);

    await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    const pushCall = gitClient.createPush.mock.calls[0][0];
    const paths = pushCall.commits[0].changes.map((c: any) => c.item.path);
    expect(paths).not.toContain("/project-template.yml");
    expect(paths).toContain("/README.md");
  });

  // ─── Exclude rules ─────────────────────────────────────────────────────────

  it("excludes a file matching an exclude rule whose 'when' condition is met", async () => {
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([
      {
        path: "/templates/api/docker-compose.yml",
        content: "",
        isBase64: false,
      },
      { path: "/templates/api/README.md", content: "", isBase64: false },
    ]);

    const repoTemplate = makeRepoTemplate({
      exclude: [{ path: "docker-compose.yml", when: "includeDocker == false" }],
    });

    await scaffoldRepository("proj1", repoTemplate, "sp", "sr", {
      ...PARAMS,
      includeDocker: false,
    });

    const pushCall = gitClient.createPush.mock.calls[0][0];
    const paths = pushCall.commits[0].changes.map((c: any) => c.item.path);
    expect(paths).not.toContain("/docker-compose.yml");
  });

  it("keeps a file when the exclude rule 'when' condition is NOT met", async () => {
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([
      {
        path: "/templates/api/docker-compose.yml",
        content: "",
        isBase64: false,
      },
    ]);

    const repoTemplate = makeRepoTemplate({
      exclude: [{ path: "docker-compose.yml", when: "includeDocker == false" }],
    });

    await scaffoldRepository("proj1", repoTemplate, "sp", "sr", {
      ...PARAMS,
      includeDocker: true,
    });

    const pushCall = gitClient.createPush.mock.calls[0][0];
    const paths = pushCall.commits[0].changes.map((c: any) => c.item.path);
    expect(paths).toContain("/docker-compose.yml");
  });

  // ─── Existing repository (non-empty) → skipped ────────────────────────────

  it("returns 'skipped' when the repo already exists and has refs", async () => {
    mockCheckRepoExists.mockResolvedValue({ exists: true, isNonEmpty: true });
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);

    const result = await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    expect(result.status).toBe("skipped");
    expect(gitClient.createRepository).not.toHaveBeenCalled();
    expect(gitClient.createPush).not.toHaveBeenCalled();
  });

  // ─── Empty files → skipped ─────────────────────────────────────────────────

  it("returns 'skipped' when there are no template files", async () => {
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([]);

    const result = await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    expect(result.status).toBe("skipped");
    expect(result.reason).toMatch(/no files/i);
  });

  // ─── Error paths ───────────────────────────────────────────────────────────

  it("returns 'failed' when checkRepoExists throws", async () => {
    mockCheckRepoExists.mockRejectedValue(new Error("Network error"));
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);

    const result = await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/Failed to check repository existence/);
  });

  it("returns 'failed' when createRepository throws", async () => {
    const gitClient = makeGitClient({
      createRepository: jest.fn().mockRejectedValue(new Error("Forbidden")),
    });
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([]);

    const result = await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/Failed to create repository/);
  });

  it("returns 'failed' when fetchTemplateFiles throws", async () => {
    const gitClient = makeGitClient();
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockRejectedValue(new Error("Git error"));

    const result = await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/Failed to read template files/);
  });

  it("returns 'failed' when createPush throws", async () => {
    const gitClient = makeGitClient({
      createPush: jest.fn().mockRejectedValue(new Error("Push failed")),
    });
    mockGetClient.mockReturnValue(gitClient);
    mockFetchTemplateFiles.mockResolvedValue([
      {
        path: "/templates/api/README.md",
        content: "# Readme",
        isBase64: false,
      },
    ]);

    const result = await scaffoldRepository("proj1", makeRepoTemplate(), "sp", "sr", PARAMS);

    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/Failed to push files/);
  });
});
