// The settings service has module-level state (manager cache), so each test
// resets modules and loads a fresh instance via doMock + require.

import type { RestrictedProject } from "../../src/Hub/services/extensionSettingsService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeManager(overrides: { getValue?: jest.Mock; setValue?: jest.Mock }) {
  return {
    getValue: overrides.getValue ?? jest.fn().mockResolvedValue(null),
    setValue: overrides.setValue ?? jest.fn().mockResolvedValue(undefined),
  };
}

function loadFreshModule(options: {
  managerOverrides?: { getValue?: jest.Mock; setValue?: jest.Mock };
  managerError?: Error;
}) {
  const mockManager = makeManager(options.managerOverrides ?? {});

  const mockGetExtensionDataManager = options.managerError
    ? jest.fn().mockRejectedValue(options.managerError)
    : jest.fn().mockResolvedValue(mockManager);

  jest.doMock("azure-devops-extension-sdk", () => ({
    getService: jest.fn().mockResolvedValue({
      getExtensionDataManager: mockGetExtensionDataManager,
    }),
    getAccessToken: jest.fn().mockResolvedValue("test-token"),
    getExtensionContext: jest.fn().mockReturnValue({ id: "publisher.extension" }),
  }));

  // CommonServiceIds is referenced as a const enum; supply the runtime string value directly.
  jest.doMock("azure-devops-extension-api", () => ({
    CommonServiceIds: {
      ExtensionDataService: "ms.vss-features.extension-data-service",
    },
  }));

  const service = require("../../src/Hub/services/extensionSettingsService") as {
    getRestrictedProjects: () => Promise<RestrictedProject[]>;
    setRestrictedProjects: (projects: RestrictedProject[]) => Promise<void>;
    getTemplateCategories: () => Promise<string[]>;
    setTemplateCategories: (categories: string[]) => Promise<void>;
  };

  return { service, mockManager, mockGetExtensionDataManager };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("getRestrictedProjects", () => {
  it("returns an empty array when no value is stored", async () => {
    const { service } = loadFreshModule({});

    const result = await service.getRestrictedProjects();

    expect(result).toEqual([]);
  });

  it("returns the stored projects array when restrictions are set", async () => {
    const stored: RestrictedProject[] = [
      { id: "proj-id-1", name: "My Project" },
      { id: "proj-id-2", name: "Another Project" },
    ];
    const { service } = loadFreshModule({
      managerOverrides: {
        getValue: jest.fn().mockResolvedValue({ projects: stored }),
      },
    });

    const result = await service.getRestrictedProjects();

    expect(result).toEqual(stored);
  });

  it("returns an empty array when the manager cannot be obtained (fails open)", async () => {
    const { service } = loadFreshModule({
      managerError: new Error("Service unavailable"),
    });

    const result = await service.getRestrictedProjects();

    expect(result).toEqual([]);
  });

  it("returns an empty array when getValue rejects (fails open)", async () => {
    const { service } = loadFreshModule({
      managerOverrides: {
        getValue: jest.fn().mockRejectedValue(new Error("Storage error")),
      },
    });

    const result = await service.getRestrictedProjects();

    expect(result).toEqual([]);
  });
});

describe("setRestrictedProjects", () => {
  it("calls setValue with the correct key and wrapped value", async () => {
    const mockSetValue = jest.fn().mockResolvedValue(undefined);
    const { service } = loadFreshModule({
      managerOverrides: { setValue: mockSetValue },
    });

    const projects: RestrictedProject[] = [
      { id: "proj-abc", name: "Alpha Project" },
      { id: "proj-xyz", name: "Zeta Project" },
    ];
    await service.setRestrictedProjects(projects);

    expect(mockSetValue).toHaveBeenCalledWith("restrictedProjects", {
      projects,
    });
  });

  it("persists an empty array to clear all restrictions", async () => {
    const mockSetValue = jest.fn().mockResolvedValue(undefined);
    const { service } = loadFreshModule({
      managerOverrides: { setValue: mockSetValue },
    });

    await service.setRestrictedProjects([]);

    expect(mockSetValue).toHaveBeenCalledWith("restrictedProjects", {
      projects: [],
    });
  });

  it("throws when setValue rejects", async () => {
    const { service } = loadFreshModule({
      managerOverrides: {
        setValue: jest.fn().mockRejectedValue(new Error("Permission denied")),
      },
    });

    await expect(service.setRestrictedProjects([{ id: "id", name: "name" }])).rejects.toThrow("Permission denied");
  });
});

describe("manager caching", () => {
  it("obtains the manager only once across multiple calls", async () => {
    const { service, mockGetExtensionDataManager } = loadFreshModule({});

    await service.getRestrictedProjects();
    await service.getRestrictedProjects();
    await service.setRestrictedProjects([]);

    expect(mockGetExtensionDataManager).toHaveBeenCalledTimes(1);
  });

  it("retries getting the manager after a failure", async () => {
    const mockGetExtensionDataManager = jest
      .fn()
      .mockRejectedValueOnce(new Error("Transient error"))
      .mockResolvedValueOnce(
        makeManager({
          getValue: jest.fn<Promise<null>, []>().mockResolvedValue(null),
        }),
      );

    jest.doMock("azure-devops-extension-sdk", () => ({
      getService: jest.fn().mockResolvedValue({
        getExtensionDataManager: mockGetExtensionDataManager,
      }),
      getAccessToken: jest.fn().mockResolvedValue("test-token"),
      getExtensionContext: jest.fn().mockReturnValue({ id: "publisher.extension" }),
    }));

    jest.doMock("azure-devops-extension-api", () => ({
      CommonServiceIds: {
        ExtensionDataService: "ms.vss-features.extension-data-service",
      },
    }));

    const service = require("../../src/Hub/services/extensionSettingsService") as {
      getRestrictedProjects: () => Promise<RestrictedProject[]>;
    };

    // First call: manager creation fails → getRestrictedProjects fails open → returns []
    const result1 = await service.getRestrictedProjects();
    expect(result1).toEqual([]);

    // Second call: manager creation succeeds (cache was cleared after error)
    const result2 = await service.getRestrictedProjects();
    expect(result2).toEqual([]);

    expect(mockGetExtensionDataManager).toHaveBeenCalledTimes(2);
  });
});

describe("getTemplateCategories", () => {
  it("returns an empty array when no value is stored", async () => {
    const { service } = loadFreshModule({});

    const result = await service.getTemplateCategories();

    expect(result).toEqual([]);
  });

  it("returns the stored categories array", async () => {
    const stored = ["Backend", "Frontend", "Data"];
    const { service } = loadFreshModule({
      managerOverrides: {
        getValue: jest.fn().mockResolvedValue({ categories: stored }),
      },
    });

    const result = await service.getTemplateCategories();

    expect(result).toEqual(stored);
  });

  it("returns an empty array when the manager cannot be obtained (fails open)", async () => {
    const { service } = loadFreshModule({
      managerError: new Error("Service unavailable"),
    });

    const result = await service.getTemplateCategories();

    expect(result).toEqual([]);
  });

  it("returns an empty array when getValue rejects (fails open)", async () => {
    const { service } = loadFreshModule({
      managerOverrides: {
        getValue: jest.fn().mockRejectedValue(new Error("Storage error")),
      },
    });

    const result = await service.getTemplateCategories();

    expect(result).toEqual([]);
  });
});

describe("setTemplateCategories", () => {
  it("calls setValue with the correct key and wrapped value", async () => {
    const mockSetValue = jest.fn().mockResolvedValue(undefined);
    const { service } = loadFreshModule({
      managerOverrides: { setValue: mockSetValue },
    });

    await service.setTemplateCategories(["Backend", "Frontend"]);

    expect(mockSetValue).toHaveBeenCalledWith("templateCategories", {
      categories: ["Backend", "Frontend"],
    });
  });

  it("persists an empty array to clear all categories", async () => {
    const mockSetValue = jest.fn().mockResolvedValue(undefined);
    const { service } = loadFreshModule({
      managerOverrides: { setValue: mockSetValue },
    });

    await service.setTemplateCategories([]);

    expect(mockSetValue).toHaveBeenCalledWith("templateCategories", {
      categories: [],
    });
  });

  it("throws when setValue rejects", async () => {
    const { service } = loadFreshModule({
      managerOverrides: {
        setValue: jest.fn().mockRejectedValue(new Error("Permission denied")),
      },
    });

    await expect(service.setTemplateCategories(["Backend"])).rejects.toThrow("Permission denied");
  });
});
