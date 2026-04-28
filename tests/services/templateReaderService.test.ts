import {
  readTemplateFromRepo,
  fetchTemplateFiles,
  fetchTemplateFileList,
} from "../../src/services/templateReaderService";

// Mock the ADO Git client
jest.mock("azure-devops-extension-api", () => ({
  getClient: jest.fn(),
}));

// Also mock the Git subpath so enum values used in production code are available
jest.mock("azure-devops-extension-api/Git", () => ({
  GitRestClient: jest.fn(),
  VersionControlRecursionType: { Full: 120 },
  VersionControlChangeType: { Add: 1 },
  ItemContentType: { RawText: 0, Base64Encoded: 1 },
}));

import { getClient } from "azure-devops-extension-api";

// ─── Minimal valid template YAML ──────────────────────────────────────────────

const MINIMAL_YAML = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "My Template"
version: "1.0.0"
parameters: []
`;

const FULL_YAML = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "My Template"
version: "1.0.0"
description: "A full template"
maintainers:
  - alice@example.com
preScaffoldNotes:
  - "Read the docs first"
postScaffoldNotes:
  - "Done!"
parameters:
  - id: projectName
    label: "Project Name"
    type: string
    required: true
    hint: "Lowercase only"
    validation:
      regex: "^[a-z0-9-]+$"
      message: "Must be lowercase alphanumeric with hyphens"
  - id: includeDocker
    label: "Include Docker"
    type: boolean
    defaultValue: false
    when: "projectName"
  - id: framework
    label: "Framework"
    type: choice
    options:
      - dotnet
      - node
      - python
computed:
  - id: isDotnet
    expression: "framework == 'dotnet'"
  - id: backendWithDocker
    expression: "includeDocker && includeDocker"
scaffoldingSteps:
  - type: repository
    name: "{{projectName}}-api"
    sourcePath: templates/api
    defaultBranch: main
    when: "includeDocker"
    exclude:
      - path: docker-compose.yml
        when: "includeDocker == false"
  - type: pipeline
    name: "{{projectName}}-ci"
    repository: "{{projectName}}-api"
    yamlPath: azure-pipelines.yml
    folder: /MyPipelines
    when: "includeDocker"
`;

function makeMockGitClient(yamlContent: string, commitId = "abc1234567890") {
  return {
    getItem: jest.fn().mockResolvedValue({ commitId }),
    getItemText: jest.fn().mockResolvedValue(yamlContent),
  };
}

// ─── readTemplateFromRepo ──────────────────────────────────────────────────────

describe("readTemplateFromRepo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses a minimal valid YAML and returns a TemplateDefinition", async () => {
    const mockClient = makeMockGitClient(MINIMAL_YAML, "deadbeef1234");
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("proj1", "repo1", "/project-template.yml");

    expect(result.definition.id).toBe("504c735f-8f8d-4365-b787-a8f135c45c62");
    expect(result.definition.name).toBe("My Template");
    expect(result.definition.version).toBe("1.0.0");
    expect(result.definition.parameters).toEqual([]);
    expect(result.commitId).toBe("deadbeef1234");
  });

  it("normalises a path without a leading slash", async () => {
    const mockClient = makeMockGitClient(MINIMAL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await readTemplateFromRepo("proj1", "repo1", "project-template.yml");

    expect(mockClient.getItem).toHaveBeenCalledWith("repo1", "/project-template.yml", "proj1");
    expect(mockClient.getItemText).toHaveBeenCalledWith("repo1", "/project-template.yml", "proj1");
  });

  it("parses optional fields (description, maintainers, notes)", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");

    expect(result.definition.description).toBe("A full template");
    expect(result.definition.maintainers).toEqual(["alice@example.com"]);
    expect(result.definition.preScaffoldNotes).toEqual(["Read the docs first"]);
    expect(result.definition.postScaffoldNotes).toEqual(["Done!"]);
  });

  it("parses parameters with all optional fields", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");

    const param = result.definition.parameters[0];
    expect(param.id).toBe("projectName");
    expect(param.label).toBe("Project Name");
    expect(param.type).toBe("string");
    expect(param.required).toBe(true);
    expect(param.hint).toBe("Lowercase only");
    expect(param.validation).toEqual({
      regex: "^[a-z0-9-]+$",
      message: "Must be lowercase alphanumeric with hyphens",
    });
  });

  it("parses boolean parameter defaults", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");

    const boolParam = result.definition.parameters[1];
    expect(boolParam.type).toBe("boolean");
    expect(boolParam.defaultValue).toBe(false);
    expect(boolParam.when).toBe("projectName");
  });

  it("parses choice parameter options", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");

    const choiceParam = result.definition.parameters[2];
    expect(choiceParam.type).toBe("choice");
    expect(choiceParam.options).toEqual(["dotnet", "node", "python"]);
  });
  it("parses repository steps with when and exclude rules", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");

    const repoStep = result.definition.scaffoldingSteps.find((s) => s.type === "repository")!;
    expect(repoStep.type).toBe("repository");
    expect(repoStep.name).toBe("{{projectName}}-api");
    if (repoStep.type === "repository") {
      expect(repoStep.sourcePath).toBe("templates/api");
      expect(repoStep.defaultBranch).toBe("main");
      expect(repoStep.when).toBe("includeDocker");
      expect(repoStep.exclude).toEqual([{ path: "docker-compose.yml", when: "includeDocker == false" }]);
    }
  });

  it("parses pipeline steps with all fields", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");

    const pipelineStep = result.definition.scaffoldingSteps.find((s) => s.type === "pipeline")!;
    expect(pipelineStep.type).toBe("pipeline");
    expect(pipelineStep.name).toBe("{{projectName}}-ci");
    if (pipelineStep.type === "pipeline") {
      expect(pipelineStep.repository).toBe("{{projectName}}-api");
      expect(pipelineStep.yamlPath).toBe("azure-pipelines.yml");
      expect(pipelineStep.folder).toBe("/MyPipelines");
      expect(pipelineStep.when).toBe("includeDocker");
    }
    expect(pipelineStep.name).toBe("{{projectName}}-ci");
    if (pipelineStep.type === "pipeline") {
      expect(pipelineStep.repository).toBe("{{projectName}}-api");
      expect(pipelineStep.yamlPath).toBe("azure-pipelines.yml");
      expect(pipelineStep.folder).toBe("/MyPipelines");
      expect(pipelineStep.when).toBe("includeDocker");
    }
  });

  it("throws when YAML is not an object (scalar value)", async () => {
    // yaml.load("42") returns the number 42, which is not an object
    const mockClient = makeMockGitClient("42");
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(readTemplateFromRepo("p", "r", "/project-template.yml")).rejects.toThrow(
      "project-template.yml must be a YAML object",
    );
  });

  it("throws when required field 'id' is missing", async () => {
    const mockClient = makeMockGitClient(`name: "Test"\nversion: "1.0"\nparameters: []`);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(readTemplateFromRepo("p", "r", "/project-template.yml")).rejects.toThrow("id");
  });

  it("throws when required field 'name' is missing", async () => {
    const mockClient = makeMockGitClient(`id: "504c735f-8f8d-4365-b787-a8f135c45c62"\nversion: "1.0"\nparameters: []`);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(readTemplateFromRepo("p", "r", "/project-template.yml")).rejects.toThrow("name");
  });

  it("throws when YAML is unparseable", async () => {
    const mockClient = makeMockGitClient("{ unclosed: [");
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(readTemplateFromRepo("p", "r", "/project-template.yml")).rejects.toThrow("YAML parse error");
  });

  it("throws when a parameter type is invalid", async () => {
    const yaml = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "X"
version: "1"
parameters:
  - id: p1
    label: "P1"
    type: unsupported
`;
    const mockClient = makeMockGitClient(yaml);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(readTemplateFromRepo("p", "r", "/project-template.yml")).rejects.toThrow("type");
  });
  it("defaults to 'main' when defaultBranch is not specified", async () => {
    const yaml = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "X"
version: "1"
parameters: []
scaffoldingSteps:
  - type: repository
    name: my-repo
    sourcePath: src
`;
    const mockClient = makeMockGitClient(yaml);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
    const repoStep = result.definition.scaffoldingSteps.find((s) => s.type === "repository")!;
    if (repoStep.type === "repository") {
      expect(repoStep.defaultBranch).toBe("main");
    }
  });

  it("parses templateCategories when present", async () => {
    const yaml = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "Categorised Template"
version: "1.0.0"
templateCategories:
  - "Backend"
parameters: []
`;
    const mockClient = makeMockGitClient(yaml);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
    expect(result.definition.templateCategories).toEqual(["Backend"]);
  });

  it("leaves templateCategories undefined when the field is absent", async () => {
    const mockClient = makeMockGitClient(MINIMAL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
    expect(result.definition.templateCategories).toBeUndefined();
  });

  it("parses computed entries with id and expression", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");

    expect(result.definition.computed).toEqual([
      { id: "isDotnet", expression: "framework == 'dotnet'" },
      { id: "backendWithDocker", expression: "includeDocker && includeDocker" },
    ]);
  });

  it("leaves computed undefined when the field is absent", async () => {
    const mockClient = makeMockGitClient(MINIMAL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
    expect(result.definition.computed).toBeUndefined();
  });

  // ─── Legacy format migration ──────────────────────────────────────────────

  describe("legacy format migration", () => {
    it("migrates top-level repositories array to scaffoldingSteps", async () => {
      const yaml = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "Legacy"
version: "1.0.0"
parameters: []
repositories:
  - name: my-repo
    sourcePath: src
    defaultBranch: main
`;
      const mockClient = makeMockGitClient(yaml);
      (getClient as jest.Mock).mockReturnValue(mockClient);

      const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
      expect(result.definition.scaffoldingSteps).toHaveLength(1);
      expect(result.definition.scaffoldingSteps[0]).toMatchObject({ type: "repository", name: "my-repo" });
    });

    it("migrates top-level pipelines array to scaffoldingSteps", async () => {
      const yaml = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "Legacy"
version: "1.0.0"
parameters: []
repositories:
  - name: my-repo
    sourcePath: src
    defaultBranch: main
pipelines:
  - name: my-ci
    repository: my-repo
    yamlPath: azure-pipelines.yml
`;
      const mockClient = makeMockGitClient(yaml);
      (getClient as jest.Mock).mockReturnValue(mockClient);

      const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
      const pipeline = result.definition.scaffoldingSteps.find((s) => s.type === "pipeline");
      expect(pipeline).toMatchObject({ type: "pipeline", name: "my-ci" });
    });

    it("migrates serviceConnections and maps type -> endpointType", async () => {
      const yaml = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "Legacy"
version: "1.0.0"
parameters: []
serviceConnections:
  - name: my-sc
    type: AzureRM
    authorizationScheme: ServicePrincipal
    authorization:
      serviceprincipalid: sp-id
      serviceprincipalkey: sp-key
`;
      const mockClient = makeMockGitClient(yaml);
      (getClient as jest.Mock).mockReturnValue(mockClient);

      const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
      const sc = result.definition.scaffoldingSteps.find((s) => s.type === "serviceConnection");
      expect(sc).toMatchObject({ type: "serviceConnection", name: "my-sc" });
      if (sc?.type === "serviceConnection") {
        expect(sc.endpointType).toBe("AzureRM");
      }
    });

    it("migrates variableGroups array to scaffoldingSteps", async () => {
      const yaml = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "Legacy"
version: "1.0.0"
parameters: []
variableGroups:
  - name: my-vars
`;
      const mockClient = makeMockGitClient(yaml);
      (getClient as jest.Mock).mockReturnValue(mockClient);

      const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
      expect(result.definition.scaffoldingSteps).toHaveLength(1);
      expect(result.definition.scaffoldingSteps[0]).toMatchObject({ type: "variableGroup", name: "my-vars" });
    });

    it("orders migrated steps: repositories, serviceConnections, variableGroups, pipelines", async () => {
      const yaml = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "Legacy"
version: "1.0.0"
parameters: []
repositories:
  - name: my-repo
    sourcePath: src
    defaultBranch: main
pipelines:
  - name: my-ci
    repository: my-repo
    yamlPath: azure-pipelines.yml
serviceConnections:
  - name: my-sc
    type: AzureRM
    authorizationScheme: ServicePrincipal
    authorization: {}
variableGroups:
  - name: my-vars
`;
      const mockClient = makeMockGitClient(yaml);
      (getClient as jest.Mock).mockReturnValue(mockClient);

      const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
      const types = result.definition.scaffoldingSteps.map((s) => s.type);
      expect(types).toEqual(["repository", "serviceConnection", "variableGroup", "pipeline"]);
    });

    it("ignores legacy fields when scaffoldingSteps is already present", async () => {
      const yaml = `
id: "504c735f-8f8d-4365-b787-a8f135c45c62"
name: "Legacy"
version: "1.0.0"
parameters: []
scaffoldingSteps:
  - type: repository
    name: new-repo
    sourcePath: src
    defaultBranch: main
repositories:
  - name: old-repo
    sourcePath: src
    defaultBranch: main
`;
      const mockClient = makeMockGitClient(yaml);
      (getClient as jest.Mock).mockReturnValue(mockClient);

      const result = await readTemplateFromRepo("p", "r", "/project-template.yml");
      expect(result.definition.scaffoldingSteps).toHaveLength(1);
      expect(result.definition.scaffoldingSteps[0]).toMatchObject({ name: "new-repo" });
    });
  });
});

// ─── Helpers for file-fetching tests ──────────────────────────────────────────────────────────

function makeArrayBuffer(bytes: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.length);
  new Uint8Array(buf).set(bytes);
  return buf;
}

function makeMockGitClientForFiles(options: {
  items: Array<{ path: string; isFolder: boolean }>;
  textContent?: Record<string, string>;
  binaryContent?: Record<string, ArrayBuffer>;
  textError?: Record<string, Error>;
}) {
  return {
    getItems: jest.fn().mockResolvedValue(options.items),
    getItemText: jest.fn().mockImplementation((_repoId: string, filePath: string) => {
      if (options.textError?.[filePath]) return Promise.reject(options.textError[filePath]);
      return Promise.resolve(options.textContent?.[filePath] ?? "");
    }),
    getItemContent: jest.fn().mockImplementation((_repoId: string, filePath: string) => {
      return Promise.resolve(options.binaryContent?.[filePath] ?? new ArrayBuffer(0));
    }),
  };
}

// ─── fetchTemplateFileList ───────────────────────────────────────────────────────────

describe("fetchTemplateFileList", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns only non-folder paths from getItems", async () => {
    const mockClient = makeMockGitClientForFiles({
      items: [
        { path: "/templates/api", isFolder: true },
        { path: "/templates/api/README.md", isFolder: false },
        { path: "/templates/api/src", isFolder: true },
        { path: "/templates/api/src/index.ts", isFolder: false },
      ],
    });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await fetchTemplateFileList("proj1", "repo1", "/templates/api");

    expect(result).toEqual([
      { path: "/templates/api/README.md", isText: true },
      { path: "/templates/api/src/index.ts", isText: true },
    ]);
  });

  it("marks binary files as isText: false and text files as isText: true", async () => {
    const mockClient = makeMockGitClientForFiles({
      items: [
        { path: "/templates/api/logo.png", isFolder: false },
        { path: "/templates/api/config.yml", isFolder: false },
      ],
    });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await fetchTemplateFileList("proj1", "repo1", "/templates/api");

    expect(result).toEqual([
      { path: "/templates/api/logo.png", isText: false },
      { path: "/templates/api/config.yml", isText: true },
    ]);
  });

  it("returns empty array when all items are folders", async () => {
    const mockClient = makeMockGitClientForFiles({
      items: [{ path: "/templates", isFolder: true }],
    });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await fetchTemplateFileList("proj1", "repo1", "/templates");

    expect(result).toEqual([]);
  });

  it("passes the correct arguments to getItems", async () => {
    const mockClient = makeMockGitClientForFiles({ items: [] });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await fetchTemplateFileList("myProject", "myRepo", "/src");

    // VersionControlRecursionType.Full is mocked as 120
    expect(mockClient.getItems).toHaveBeenCalledWith("myRepo", "myProject", "/src", 120);
  });
});

// ─── fetchTemplateFiles ────────────────────────────────────────────────────────────────

describe("fetchTemplateFiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty array when source path has no files", async () => {
    const mockClient = makeMockGitClientForFiles({
      items: [{ path: "/templates/api", isFolder: true }],
    });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await fetchTemplateFiles("proj1", "repo1", "/templates/api");

    expect(result).toEqual([]);
    expect(mockClient.getItemText).not.toHaveBeenCalled();
    expect(mockClient.getItemContent).not.toHaveBeenCalled();
  });

  it("fetches text files via getItemText and returns them with isBase64: false", async () => {
    const mockClient = makeMockGitClientForFiles({
      items: [{ path: "/templates/api/README.md", isFolder: false }],
      textContent: { "/templates/api/README.md": "# Hello" },
    });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await fetchTemplateFiles("proj1", "repo1", "/templates/api");

    expect(result).toEqual([{ path: "/templates/api/README.md", content: "# Hello", isBase64: false }]);
    expect(mockClient.getItemText).toHaveBeenCalledWith("repo1", "/templates/api/README.md", "proj1");
    expect(mockClient.getItemContent).not.toHaveBeenCalled();
  });

  it("fetches binary files via getItemContent and base64-encodes them", async () => {
    // bytes 65, 66, 67 = 'A', 'B', 'C' → base64 'QUJD'
    const buf = makeArrayBuffer([65, 66, 67]);
    const mockClient = makeMockGitClientForFiles({
      items: [{ path: "/templates/api/logo.png", isFolder: false }],
      binaryContent: { "/templates/api/logo.png": buf },
    });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await fetchTemplateFiles("proj1", "repo1", "/templates/api");

    expect(result).toEqual([{ path: "/templates/api/logo.png", content: "QUJD", isBase64: true }]);
    expect(mockClient.getItemContent).toHaveBeenCalledWith("repo1", "/templates/api/logo.png", "proj1");
    expect(mockClient.getItemText).not.toHaveBeenCalled();
  });

  it("skips files that fail to fetch and continues with the rest", async () => {
    const mockClient = makeMockGitClientForFiles({
      items: [
        { path: "/templates/api/broken.ts", isFolder: false },
        { path: "/templates/api/ok.md", isFolder: false },
      ],
      textError: { "/templates/api/broken.ts": new Error("403 Forbidden") },
      textContent: { "/templates/api/ok.md": "ok content" },
    });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await fetchTemplateFiles("proj1", "repo1", "/templates/api");

    expect(result).toEqual([{ path: "/templates/api/ok.md", content: "ok content", isBase64: false }]);
  });

  it("fetches all files and preserves order", async () => {
    const paths = Array.from({ length: 5 }, (_, i) => `/templates/file${i}.ts`);
    const mockClient = makeMockGitClientForFiles({
      items: paths.map((p) => ({ path: p, isFolder: false })),
      textContent: Object.fromEntries(paths.map((p) => [p, `content of ${p}`])),
    });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await fetchTemplateFiles("proj1", "repo1", "/templates");

    expect(mockClient.getItemText).toHaveBeenCalledTimes(5);
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.path)).toEqual(paths);
    expect(result.every((r) => !r.isBase64)).toBe(true);
  });

  it("handles a mix of text and binary files", async () => {
    const buf = makeArrayBuffer([1, 2, 3]);
    const mockClient = makeMockGitClientForFiles({
      items: [
        { path: "/templates/readme.md", isFolder: false },
        { path: "/templates/icon.png", isFolder: false },
      ],
      textContent: { "/templates/readme.md": "# Readme" },
      binaryContent: { "/templates/icon.png": buf },
    });
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await fetchTemplateFiles("proj1", "repo1", "/templates");

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.path === "/templates/readme.md")).toMatchObject({
      isBase64: false,
      content: "# Readme",
    });
    expect(result.find((r) => r.path === "/templates/icon.png")).toMatchObject({ isBase64: true });
  });
});
