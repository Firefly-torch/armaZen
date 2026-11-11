import { describe, expect, it } from "vitest";

import {
  assessLocationAllocation,
  getStorageLocationIds,
  summarizeDescendantOccupancy,
  summarizeLocationCapacity,
  summarizeMaterialBalances,
} from "@/lib/warehouse-stock";

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
  { id: "parent-with-inactive-child", warehouse_id: "wh", parent_id: null, level_id: "storage", active: true, status: "disponivel" },
  { id: "inactive-child", warehouse_id: "wh", parent_id: "parent-with-inactive-child", level_id: "storage", active: false, status: "disponivel" },
];

describe("getStorageLocationIds", () => {
  it("excludes parent addresses even when their level is marked as storage", () => {
    const ids = getStorageLocationIds(locations, levels, new Set(["wh"]));

    expect(ids).toEqual(new Set(["available", "reserved", "blocked"]));
    expect(ids.has("parent")).toBe(false);
    expect(ids.has("not-storage")).toBe(false);
    expect(ids.has("inactive")).toBe(false);
    expect(ids.has("other-warehouse")).toBe(false);
    expect(ids.has("parent-with-inactive-child")).toBe(false);
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


describe("summarizeDescendantOccupancy", () => {
  it("averages compatible descendant positions without mixing measurement units", () => {
    const summary = summarizeDescendantOccupancy([
      {
        capacity: 100,
        capacity_unit: "kg",
        balances: [{ quantity: 25, unit: "kg" }],
      },
      {
        capacity: 50,
        capacity_unit: "L",
        balances: [{ quantity: 25, unit: "L" }],
      },
      {
        capacity: 100,
        capacity_unit: "kg",
        balances: [{ quantity: 20, unit: "L" }],
      },
      {
        capacity: null,
        capacity_unit: null,
        balances: [{ quantity: 2, unit: "kg" }],
      },
    ]);

    expect(summary).toEqual({
      averagePercent: 38,
      measurablePositions: 2,
      totalPositions: 4,
      occupiedPositions: 4,
      overCapacityPositions: 0,
      unknownCapacityPositions: 1,
      incompatiblePositions: 1,
    });
  });

  it("counts empty positions as zero when their capacity is known", () => {
    expect(summarizeDescendantOccupancy([
      { capacity: 100, capacity_unit: "un", balances: [] },
      { capacity: 100, capacity_unit: "un", balances: [{ quantity: 50, unit: "un" }] },
    ])).toEqual({
      averagePercent: 25,
      measurablePositions: 2,
      totalPositions: 2,
      occupiedPositions: 1,
      overCapacityPositions: 0,
      unknownCapacityPositions: 0,
      incompatiblePositions: 0,
    });
  });

  it("does not invent a percentage when no descendant has compatible capacity", () => {
    expect(summarizeDescendantOccupancy([
      { capacity: 0, capacity_unit: "kg", balances: [{ quantity: 10, unit: "kg" }] },
      { capacity: 100, capacity_unit: "kg", balances: [{ quantity: 10, unit: "L" }] },
    ])).toEqual({
      averagePercent: null,
      measurablePositions: 0,
      totalPositions: 2,
      occupiedPositions: 2,
      overCapacityPositions: 0,
      unknownCapacityPositions: 1,
      incompatiblePositions: 1,
    });
  });

  it("counts over-capacity descendants and keeps the measured average above 100 percent", () => {
    expect(summarizeDescendantOccupancy([
      { capacity: 100, capacity_unit: "kg", balances: [{ quantity: 125, unit: "kg" }] },
      { capacity: 100, capacity_unit: "kg", balances: [{ quantity: 50, unit: "kg" }] },
    ])).toMatchObject({
      averagePercent: 88,
      measurablePositions: 2,
      totalPositions: 2,
      occupiedPositions: 2,
      overCapacityPositions: 1,
      unknownCapacityPositions: 0,
      incompatiblePositions: 0,
    });
  });
});


describe("summarizeLocationCapacity", () => {
  it("does not present an unconfigured capacity as zero percent or free space", () => {
    expect(summarizeLocationCapacity(null, null, [])).toMatchObject({
      status: "unknown",
      percentage: null,
      remaining: null,
      overCapacity: false,
    });
  });

  it("keeps an over-capacity reading above 100 percent instead of hiding the excess", () => {
    expect(summarizeLocationCapacity(100, "kg", [
      { quantity: 125, unit: "kg" },
    })).toMatchObject({
      status: "measurable",
      occupiedQuantity: 125,
      percentage: 125,
      remaining: 0,
      overCapacity: true,
    });
  });

  it("does not mix incompatible measurement units", () => {
    expect(summarizeLocationCapacity(100, "kg", [
      { quantity: 10, unit: "L" },
    })).toMatchObject({
      status: "incompatible",
      percentage: null,
      remaining: null,
    });
  });
});

describe("assessLocationAllocation", () => {
  const material = { id: "mat-a", category: "Ferragens", unit: "kg" };
  const location = {
    id: "position",
    active: true,
    status: "disponivel",
    capacity: 100,
    capacity_unit: "kg",
    allow_mixed_materials: true,
    allowed_categories: ["ferragens"],
  };

  it("blocks an allocation that would exceed the configured capacity", () => {
    const assessment = assessLocationAllocation(
      location,
      material,
      15,
      [{ material_id: material.id, location_id: location.id, quantity: 90 }],
      [material],
    );

    expect(assessment.allowed).toBe(false);
    expect(assessment.message).toContain("Capacidade excedida");
  });

  it("blocks a material category not allowed at the destination", () => {
    const assessment = assessLocationAllocation(
      location,
      { id: "chemical", category: "Químicos", unit: "kg" },
      1,
      [],
      [material],
    );

    expect(assessment.allowed).toBe(false);
    expect(assessment.message).toContain("não é permitida");
  });

  it("blocks a second material when the destination is configured for a single material", () => {
    const assessment = assessLocationAllocation(
      { ...location, allow_mixed_materials: false },
      { id: "mat-b", category: "Ferragens", unit: "kg" },
      1,
      [{ material_id: "mat-a", location_id: location.id, quantity: 5 }],
      [material],
    );

    expect(assessment.allowed).toBe(false);
    expect(assessment.message).toContain("apenas um material");
  });

  it("allows a compatible destination with capacity still available", () => {
    const assessment = assessLocationAllocation(
      location,
      material,
      5,
      [{ material_id: material.id, location_id: location.id, quantity: 20 }],
      [material],
    );

    expect(assessment).toMatchObject({
      allowed: true,
      status: "within_capacity",
      currentQuantity: 20,
      projectedQuantity: 25,
      remainingCapacity: 75,
    });
  });

  it("allows operation with unknown capacity only while clearly reporting the uncertainty", () => {
    const assessment = assessLocationAllocation(
      { ...location, capacity: null, capacity_unit: null },
      material,
      5,
      [],
      [material],
    );

    expect(assessment).toMatchObject({
      allowed: true,
      status: "unknown_capacity",
      currentQuantity: null,
      projectedQuantity: null,
      remainingCapacity: null,
    });
    expect(assessment.message).toContain("indeterminada");
  });
});
