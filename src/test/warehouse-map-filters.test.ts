import { describe, expect, it } from "vitest";

import {
  buildWarehouseHierarchyFilterSteps,
  isLocationWithinBranch,
} from "@/lib/warehouse-map-filters";

const levels = [
  { id: "area", name: "Setor", sort_order: 1 },
  { id: "corridor", name: "Corredor", sort_order: 2 },
  { id: "shelf", name: "Estante", sort_order: 3 },
];

const locations = [
  { id: "sector-a", parent_id: null, level_id: "area", code: "A", name: "Setor A" },
  { id: "sector-b", parent_id: null, level_id: "area", code: "B", name: "Setor B" },
  { id: "corridor-a1", parent_id: "sector-a", level_id: "corridor", code: "A-01", name: "Corredor 01" },
  { id: "corridor-a2", parent_id: "sector-a", level_id: "corridor", code: "A-02", name: "Corredor 02" },
  { id: "corridor-b1", parent_id: "sector-b", level_id: "corridor", code: "B-01", name: "Corredor 01" },
  { id: "shelf-a1-01", parent_id: "corridor-a1", level_id: "shelf", code: "A-01-01", name: "Estante 01" },
];

describe("buildWarehouseHierarchyFilterSteps", () => {
  it("starts with root locations and reveals children after a parent is selected", () => {
    const rootSteps = buildWarehouseHierarchyFilterSteps(locations, levels, []);

    expect(rootSteps).toHaveLength(1);
    expect(rootSteps[0].label).toBe("Setor");
    expect(rootSteps[0].options.map((location) => location.id)).toEqual(["sector-a", "sector-b"]);

    const selectedSteps = buildWarehouseHierarchyFilterSteps(locations, levels, ["sector-a"]);

    expect(selectedSteps).toHaveLength(2);
    expect(selectedSteps[1].label).toBe("Corredor");
    expect(selectedSteps[1].options.map((location) => location.id)).toEqual([
      "corridor-a1",
      "corridor-a2",
    ]);
  });

  it("continues through the actual configured depth instead of assuming fixed labels", () => {
    const steps = buildWarehouseHierarchyFilterSteps(
      locations,
      levels,
      ["sector-a", "corridor-a1"],
    );

    expect(steps.map((step) => step.label)).toEqual(["Setor", "Corredor", "Estante"]);
    expect(steps[2].options.map((location) => location.id)).toEqual(["shelf-a1-01"]);
  });

  it("ignores a stale selection rather than exposing another branch's children", () => {
    const steps = buildWarehouseHierarchyFilterSteps(locations, levels, ["missing-sector"]);

    expect(steps).toHaveLength(1);
    expect(steps[0].selectedId).toBe("");
  });
});

describe("isLocationWithinBranch", () => {
  const locationsById = new Map(locations.map((location) => [location.id, location] as const));

  it("matches the branch root and its descendants, but not sibling branches", () => {
    expect(isLocationWithinBranch("corridor-a1", "sector-a", locationsById)).toBe(true);
    expect(isLocationWithinBranch("shelf-a1-01", "sector-a", locationsById)).toBe(true);
    expect(isLocationWithinBranch("sector-a", "sector-a", locationsById)).toBe(true);
    expect(isLocationWithinBranch("corridor-b1", "sector-a", locationsById)).toBe(false);
  });

  it("treats an empty branch as no additional restriction", () => {
    expect(isLocationWithinBranch("corridor-b1", "", locationsById)).toBe(true);
  });
});
