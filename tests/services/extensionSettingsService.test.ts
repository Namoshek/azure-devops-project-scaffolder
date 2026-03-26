// The settings service has module-level state (manager cache), so each test
// resets modules and loads a fresh instance via doMock + require.

import type { RestrictedProject } from "../../src/Hub/services/extensionSettingsService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeManager(overrides: {
  getValue?: jest.Mock;
  setValue?: jest.Mock;
}) {
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
    getExtensionContext: jest
      .fn()
      .mockReturnValue({ id: "publisher.extension" }),
  }));

  // CommonServiceIds is referenced as a const enum; supply the runtime string value directly.
  jest.doMock("azure-devops-extension-api", () => ({
    CommonServiceIds: {
      ExtensionDataService: "ms.vss-features.extension-data-service",
    },
  }));

  const service =
    require("../../src/Hub/services/extensionSettingsService") as {
      getRestrictedProject: () => Promise<RestrictedProject | null>;
      setRestrictedProject: (id: string, name: string) => Promise<void>;
      clearRestrictedProject: () => Promise<void>;
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

describe("getRestrictedProject", () => {
  it("returns null when no value is stored", async () => {
    const { service } = loadFreshModule({});

    const result = await service.getRestrictedProject();

    expect(result).toBeNull();
  });

  it("returns the stored project when a restriction is set", async () => {
    const stored: RestrictedProject = { id: "proj-id-1", name: "My Project" };
    const { service } = loadFreshModule({
      managerOverrides: {
        // The service stores values wrapped in { project: ... }
        getValue: jest.fn().mockResolvedValue({ project: stored }),
      },
    });

    const result = await service.getRestrictedProject();

    expect(result).toEqual(stored);
  });

  it("returns null when the manager cannot be obtained (fails open)", async () => {
    const { service } = loadFreshModule({
      managerError: new Error("Service unavailable"),
    });

    const result = await service.getRestrictedProject();

    expect(result).toBeNull();
  });

  it("returns null when getValue rejects (fails open)", async () => {
    const { service } = loadFreshModule({
      managerOverrides: {
        getValue: jest.fn().mockRejectedValue(new Error("Storage error")),
      },
    });

    const result = await service.getRestrictedProject();

    expect(result).toBeNull();
  });
});

describe("setRestrictedProject", () => {
  it("calls setValue with the correct key and value", async () => {
    const mockSetValue = jest.fn().mockResolvedValue(undefined);
    const { service } = loadFreshModule({
      managerOverrides: { setValue: mockSetValue },
    });

    await service.setRestrictedProject("proj-abc", "Alpha Project");

    expect(mockSetValue).toHaveBeenCalledWith("restrictedProject", {
      project: { id: "proj-abc", name: "Alpha Project" },
    });
  });

  it("throws when setValue rejects", async () => {
    const { service } = loadFreshModule({
      managerOverrides: {
        setValue: jest.fn().mockRejectedValue(new Error("Permission denied")),
      },
    });

    await expect(service.setRestrictedProject("id", "name")).rejects.toThrow(
      "Permission denied",
    );
  });
});

describe("clearRestrictedProject", () => {
  it("calls setValue with a { project: null } wrapper to clear the restriction", async () => {
    const mockSetValue = jest.fn().mockResolvedValue(undefined);
    const { service } = loadFreshModule({
      managerOverrides: { setValue: mockSetValue },
    });

    await service.clearRestrictedProject();

    // Must use a wrapper object — passing null directly causes
    // "Cannot set properties of null" in the ADO extension data SDK serializer.
    expect(mockSetValue).toHaveBeenCalledWith("restrictedProject", {
      project: null,
    });
  });

  it("throws when setValue rejects", async () => {
    const { service } = loadFreshModule({
      managerOverrides: {
        setValue: jest.fn().mockRejectedValue(new Error("Write failed")),
      },
    });

    await expect(service.clearRestrictedProject()).rejects.toThrow(
      "Write failed",
    );
  });
});

describe("manager caching", () => {
  it("obtains the manager only once across multiple calls", async () => {
    const { service, mockGetExtensionDataManager } = loadFreshModule({});

    await service.getRestrictedProject();
    await service.getRestrictedProject();
    await service.setRestrictedProject("id", "name");

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
      getExtensionContext: jest
        .fn()
        .mockReturnValue({ id: "publisher.extension" }),
    }));

    jest.doMock("azure-devops-extension-api", () => ({
      CommonServiceIds: {
        ExtensionDataService: "ms.vss-features.extension-data-service",
      },
    }));

    const service =
      require("../../src/Hub/services/extensionSettingsService") as {
        getRestrictedProject: () => Promise<RestrictedProject | null>;
      };

    // First call: manager creation fails → getRestrictedProject fails open → returns null
    const result1 = await service.getRestrictedProject();
    expect(result1).toBeNull();

    // Second call: manager creation succeeds (cache was cleared after error)
    const result2 = await service.getRestrictedProject();
    expect(result2).toBeNull();

    expect(mockGetExtensionDataManager).toHaveBeenCalledTimes(2);
  });
});
