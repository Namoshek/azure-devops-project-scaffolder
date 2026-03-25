import { readTemplateFromRepo } from "../../src/Hub/services/templateReaderService";

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
id: "abc123"
name: "My Template"
version: "1.0.0"
parameters: []
`;

const FULL_YAML = `
id: "abc123"
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
repositories:
  - name: "{{projectName}}-api"
    sourcePath: /templates/api
    defaultBranch: main
    when: "includeDocker"
    exclude:
      - path: docker-compose.yml
        when: "includeDocker == false"
pipelines:
  - name: "{{projectName}}-ci"
    repository: "{{projectName}}-api"
    yamlPath: azure-pipelines.yml
    folder: /MyPipelines
    when: "includeDocker"
`;

function makeMockGitClient(yamlContent: string) {
  return { getItemText: jest.fn().mockResolvedValue(yamlContent) };
}

// ─── readTemplateFromRepo ──────────────────────────────────────────────────────

describe("readTemplateFromRepo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses a minimal valid YAML and returns a TemplateDefinition", async () => {
    const mockClient = makeMockGitClient(MINIMAL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo(
      "proj1",
      "repo1",
      "/project-template.yml",
    );

    expect(result.id).toBe("abc123");
    expect(result.name).toBe("My Template");
    expect(result.version).toBe("1.0.0");
    expect(result.parameters).toEqual([]);
  });

  it("normalises a path without a leading slash", async () => {
    const mockClient = makeMockGitClient(MINIMAL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await readTemplateFromRepo("proj1", "repo1", "project-template.yml");

    expect(mockClient.getItemText).toHaveBeenCalledWith(
      "repo1",
      "/project-template.yml",
      "proj1",
    );
  });

  it("parses optional fields (description, maintainers, notes)", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo(
      "p",
      "r",
      "/project-template.yml",
    );

    expect(result.description).toBe("A full template");
    expect(result.maintainers).toEqual(["alice@example.com"]);
    expect(result.preScaffoldNotes).toEqual(["Read the docs first"]);
    expect(result.postScaffoldNotes).toEqual(["Done!"]);
  });

  it("parses parameters with all optional fields", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo(
      "p",
      "r",
      "/project-template.yml",
    );

    const param = result.parameters[0];
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

    const result = await readTemplateFromRepo(
      "p",
      "r",
      "/project-template.yml",
    );

    const boolParam = result.parameters[1];
    expect(boolParam.type).toBe("boolean");
    expect(boolParam.defaultValue).toBe(false);
    expect(boolParam.when).toBe("projectName");
  });

  it("parses choice parameter options", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo(
      "p",
      "r",
      "/project-template.yml",
    );

    const choiceParam = result.parameters[2];
    expect(choiceParam.type).toBe("choice");
    expect(choiceParam.options).toEqual(["dotnet", "node", "python"]);
  });

  it("parses repositories with when and exclude rules", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo(
      "p",
      "r",
      "/project-template.yml",
    );

    const repo = result.repositories![0];
    expect(repo.name).toBe("{{projectName}}-api");
    expect(repo.sourcePath).toBe("/templates/api");
    expect(repo.defaultBranch).toBe("main");
    expect(repo.when).toBe("includeDocker");
    expect(repo.exclude).toEqual([
      { path: "docker-compose.yml", when: "includeDocker == false" },
    ]);
  });

  it("parses pipelines with all fields", async () => {
    const mockClient = makeMockGitClient(FULL_YAML);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo(
      "p",
      "r",
      "/project-template.yml",
    );

    const pipeline = result.pipelines![0];
    expect(pipeline.name).toBe("{{projectName}}-ci");
    expect(pipeline.repository).toBe("{{projectName}}-api");
    expect(pipeline.yamlPath).toBe("azure-pipelines.yml");
    expect(pipeline.folder).toBe("/MyPipelines");
    expect(pipeline.when).toBe("includeDocker");
  });

  it("throws when YAML is not an object (scalar value)", async () => {
    // yaml.load("42") returns the number 42, which is not an object
    const mockClient = makeMockGitClient("42");
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(
      readTemplateFromRepo("p", "r", "/project-template.yml"),
    ).rejects.toThrow("project-template.yml must be a YAML object");
  });

  it("throws when required field 'id' is missing", async () => {
    const mockClient = makeMockGitClient(
      `name: "Test"\nversion: "1.0"\nparameters: []`,
    );
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(
      readTemplateFromRepo("p", "r", "/project-template.yml"),
    ).rejects.toThrow("id");
  });

  it("throws when required field 'name' is missing", async () => {
    const mockClient = makeMockGitClient(
      `id: "abc"\nversion: "1.0"\nparameters: []`,
    );
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(
      readTemplateFromRepo("p", "r", "/project-template.yml"),
    ).rejects.toThrow("name");
  });

  it("throws when YAML is unparseable", async () => {
    const mockClient = makeMockGitClient("{ unclosed: [");
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(
      readTemplateFromRepo("p", "r", "/project-template.yml"),
    ).rejects.toThrow("YAML parse error");
  });

  it("throws when a parameter type is invalid", async () => {
    const yaml = `
id: "x"
name: "X"
version: "1"
parameters:
  - id: p1
    label: "P1"
    type: unsupported
`;
    const mockClient = makeMockGitClient(yaml);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    await expect(
      readTemplateFromRepo("p", "r", "/project-template.yml"),
    ).rejects.toThrow("type");
  });

  it("defaults to 'main' when defaultBranch is not specified", async () => {
    const yaml = `
id: "x"
name: "X"
version: "1"
parameters: []
repositories:
  - name: my-repo
    sourcePath: /src
`;
    const mockClient = makeMockGitClient(yaml);
    (getClient as jest.Mock).mockReturnValue(mockClient);

    const result = await readTemplateFromRepo(
      "p",
      "r",
      "/project-template.yml",
    );
    expect(result.repositories![0].defaultBranch).toBe("main");
  });
});
