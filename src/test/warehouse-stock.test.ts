import { describe, expect, it } from "vitest";

import { getStorageLocationIds, summarizeMaterialBalances } from "@/lib/warehouse-stock";

const levels = [
  { id: "storage", is_storage: true },
  { id: "structure", is_storage: false },
];

const locations = [
  { id: "parent", warehouse_id: "wh", parent_id: null, level_id: "storage", active: true, status: "disponivel" },
  { id: "available", warehouse_id: "wh", parent_id: "parent", level_id: "storage", active: true, status: "disponivel" },
  { id: "reserved", warehouse_id: "wh", parent_id: "parent", level_id: "storage", active: true, status: "reservado" },
  { id: "blocked", warehouse_id: "wh", parent_id: "parent", level_id: "storage", active: true, status: "bloqueado" },
  { id: "not-storage", warehouse_id: "wh", parent_id: null, level_id: "structure", active: true, status: "disponivel" },
  { id: "inactive", warehouse_id: "wh", parent_id: null, level_id: "storage", active: false, status: "disponivel" },
  { id: "other-warehouse", warehouse_id: "wh-2", parent_id: null, level_id: "storage", active: true, status: "disponivel" },
];

describe("getStorageLocationIds", () => {
  it("excludes parent addresses even when their level is marked as storage", () => {
    const ids = getStorageLocationIds(locations, levels, new Set(["wh"]));

    expect(ids).toEqual(new Set(["available", "reserved", "blocked"]));
    expect(ids.has("parent")).toBe(false);
    expect(ids.has("not-storage")).toBe(false);
    expect(ids.has("inactive")).toBe(false);
    expect(ids.has("other-warehouse")).toBe(false);
  });
});

describe("summarizeMaterialBalances", () => {
  it("separates available, reserved, blocked, structural and inactive stock", () => {
    const summaries = summarizeMaterialBalances(
      [{ id: "mat" }],
      locations,
      levels,
      [
        { material_id: "mat", location_id: "available", quantity: 10 },
        { material_id: "mat", location_id: "reserved", quantity: 3 },
        { material_id: "mat", location_id: "blocked", quantity: 2 },
        { material_id: "mat", location_id: "parent", quantity: 4 },
        { material_id: "mat", location_id: "not-storage", quantity: 5 },
        { material_id: "mat", location_id: "inactive", quantity: 6 },
        { material_id: "mat", location_id: "other-warehouse", quantity: 7 },
      ],
      new Set(["wh"]),
    );

    expect(summaries.get("mat")).toEqual({
      materialId: "mat",
      availableQuantity: 10,
      reservedQuantity: 3,
      blockedQuantity: 2,
      structuralQuantity: 9,
      inactiveQuantity: 13,
      reviewQuantity: 22,
      totalQuantity: 37,
    });
  });

  it("ignores negative, null and invalid quantities instead of producing invalid totals", () => {
    const summaries = summarizeMaterialBalances(
      [{ id: "mat" }],
      locations,
      levels,
      [
        { material_id: "mat", location_id: "available", quantity: -2 },
        { material_id: "mat", location_id: "available", quantity: "not-a-number" },
        { material_id: "mat", location_id: "available", quantity: null },
      ],
      new Set(["wh"]),
    );

    expect(summaries.get("mat")?.totalQuantity).toBe(0);
  });
});
