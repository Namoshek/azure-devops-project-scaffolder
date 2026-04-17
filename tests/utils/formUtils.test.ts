import { groupParameters, ParameterGroup } from "../../src/utils/formUtils";
import { TemplateParameter } from "../../src/types/templateTypes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParam(id: string, formGroup?: string): TemplateParameter {
  return { id, label: id, type: "string", formGroup };
}

// ─── groupParameters ─────────────────────────────────────────────────────────

describe("groupParameters", () => {
  it("returns a single ungrouped bucket when no params have a formGroup", () => {
    const params = [makeParam("a"), makeParam("b"), makeParam("c")];
    const groups = groupParameters(params);

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBeUndefined();
    expect(groups[0].params).toEqual(params);
  });

  it("returns a single named group when all params share the same formGroup", () => {
    const params = [makeParam("a", "Settings"), makeParam("b", "Settings")];
    const groups = groupParameters(params);

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Settings");
    expect(groups[0].params).toEqual(params);
  });

  it("returns two named groups in first-appearance order", () => {
    const params = [makeParam("a", "Alpha"), makeParam("b", "Beta"), makeParam("c", "Alpha")];
    const groups = groupParameters(params);

    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe("Alpha");
    expect(groups[0].params.map((p) => p.id)).toEqual(["a", "c"]);
    expect(groups[1].title).toBe("Beta");
    expect(groups[1].params.map((p) => p.id)).toEqual(["b"]);
  });

  it("returns named groups first and ungrouped params last when mixed", () => {
    const params = [makeParam("a", "Repo"), makeParam("b"), makeParam("c", "Repo"), makeParam("d")];
    const groups = groupParameters(params);

    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe("Repo");
    expect(groups[0].params.map((p) => p.id)).toEqual(["a", "c"]);
    expect(groups[1].title).toBeUndefined();
    expect(groups[1].params.map((p) => p.id)).toEqual(["b", "d"]);
  });

  it("collects ungrouped params scattered throughout the list into the final bucket", () => {
    const params = [
      makeParam("ungrouped1"),
      makeParam("grouped1", "Section A"),
      makeParam("ungrouped2"),
      makeParam("grouped2", "Section A"),
      makeParam("ungrouped3"),
    ];
    const groups = groupParameters(params);

    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe("Section A");
    expect(groups[0].params.map((p) => p.id)).toEqual(["grouped1", "grouped2"]);
    expect(groups[1].title).toBeUndefined();
    expect(groups[1].params.map((p) => p.id)).toEqual(["ungrouped1", "ungrouped2", "ungrouped3"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupParameters([])).toEqual([]);
  });

  it("omits the ungrouped bucket when every param belongs to a named group", () => {
    const params = [makeParam("x", "G1"), makeParam("y", "G2")];
    const groups = groupParameters(params);

    expect(groups.every((g) => g.title !== undefined)).toBe(true);
  });

  it("preserves param order within each group", () => {
    const params = [makeParam("z", "Grp"), makeParam("m", "Grp"), makeParam("a", "Grp")];
    const groups = groupParameters(params);

    expect(groups[0].params.map((p) => p.id)).toEqual(["z", "m", "a"]);
  });
});
