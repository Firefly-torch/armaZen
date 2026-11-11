import { describe, expect, it } from "vitest";

import {
  buildPickingSequence,
  recommendStorageLocations,
  type PlanningBalance,
  type PlanningLevel,
  type PlanningLocation,
  type PlanningMaterial,
  type PlanningWarehouse,
} from "@/lib/warehouse-planning";

const warehouses: PlanningWarehouse[] = [
  { id: "wh", name: "Centro de Distribuição", code: "CD", active: true },
  { id: "inactive-wh", name: "Armazém inativo", code: "OFF", active: false },
];

const levels: PlanningLevel[] = [
  { id: "structure", is_storage: false },
  { id: "storage", is_storage: true },
];

const locations: PlanningLocation[] = [
  {
    id: "area",
    warehouse_id: "wh",
    parent_id: null,
    level_id: "structure",
    code: "A",
    name: "Área A",
    active: true,
    status: "disponivel",
    capacity: null,
    capacity_unit: null,
  },
  {
    id: "slot-2",
    warehouse_id: "wh",
    parent_id: "area",
    level_id: "storage",
    code: "A-02",
    name: "Posição 02",
    active: true,
    status: "disponivel",
    capacity: 100,
    capacity_unit: "kg",
    allow_mixed_materials: true,
    allowed_categories: [],
  },
  {
    id: "slot-10",
    warehouse_id: "wh",
    parent_id: "area",
    level_id: "storage",
    code: "A-10",
    name: "Posição 10",
    active: true,
    status: "disponivel",
    capacity: 50,
    capacity_unit: "kg",
    allow_mixed_materials: true,
    allowed_categories: [],
  },
  {
    id: "unknown-capacity",
    warehouse_id: "wh",
    parent_id: "area",
    level_id: "storage",
    code: "A-11",
    name: "Posição sem capacidade",
    active: true,
    status: "disponivel",
    capacity: null,
    capacity_unit: null,
    allow_mixed_materials: true,
    allowed_categories: [],
  },
  {
    id: "unit-mismatch-slot",
    warehouse_id: "wh",
    parent_id: "area",
    level_id: "storage",
    code: "A-15",
    name: "Posição com unidade incompatível",
    active: true,
    status: "disponivel",
    capacity: 100,
    capacity_unit: "L",
    allow_mixed_materials: true,
    allowed_categories: [],
  },
  {
    id: "reserved-slot",
    warehouse_id: "wh",
    parent_id: "area",
    level_id: "storage",
    code: "A-12",
    name: "Posição reservada",
    active: true,
    status: "reservado",
    capacity: 100,
    capacity_unit: "kg",
  },
  {
    id: "blocked-slot",
    warehouse_id: "wh",
    parent_id: "area",
    level_id: "storage",
    code: "A-13",
    name: "Posição bloqueada",
    active: true,
    status: "bloqueado",
    capacity: 100,
    capacity_unit: "kg",
  },
  {
    id: "inactive-slot",
    warehouse_id: "wh",
    parent_id: "area",
    level_id: "storage",
    code: "A-14",
    name: "Posição inativa",
    active: false,
    status: "disponivel",
    capacity: 100,
    capacity_unit: "kg",
  },
  {
    id: "other-warehouse-slot",
    warehouse_id: "inactive-wh",
    parent_id: null,
    level_id: "storage",
    code: "B-01",
    name: "Outra posição",
    active: true,
    status: "disponivel",
    capacity: 100,
    capacity_unit: "kg",
  },
];

const materials: PlanningMaterial[] = [
  { id: "mat-a", code: "MAT-A", category: "Ferragens", unit: "kg" },
  { id: "mat-b", code: "MAT-B", category: "Químicos", unit: "kg" },
];

const balances: PlanningBalance[] = [
  { material_id: "mat-a", location_id: "slot-2", quantity: 20, lot: "A-1" },
  { material_id: "mat-b", location_id: "slot-10", quantity: 10, lot: "B-1" },
];

describe("recommendStorageLocations", () => {
  it("prioritizes consolidation of the same material and explains the recommendation", () => {
    const suggestions = recommendStorageLocations({
      material: materials[0]!,
      requestedQuantity: 15,
      locations,
      levels,
      balances,
      materials,
      warehouses,
    });

    expect(suggestions[0]?.location.id).toBe("slot-2");
    expect(suggestions[0]?.reasons.join(" ")).toContain("Já armazena este material");
    expect(suggestions[0]?.status).toBe("within_capacity");
  });

  it("excludes blocked, reserved, inactive and structural locations by default", () => {
    const suggestions = recommendStorageLocations({
      material: materials[0]!,
      requestedQuantity: 5,
      locations,
      levels,
      balances,
      materials,
      warehouses,
    });

    const ids = suggestions.map((suggestion) => suggestion.location.id);
    expect(ids).not.toContain("area");
    expect(ids).not.toContain("reserved-slot");
    expect(ids).not.toContain("blocked-slot");
    expect(ids).not.toContain("inactive-slot");
    expect(ids).not.toContain("other-warehouse-slot");
  });

  it("returns unknown-capacity positions only with an explicit warning and after measurable options", () => {
    const suggestions = recommendStorageLocations({
      material: materials[0]!,
      requestedQuantity: 5,
      locations: locations.filter((location) =>
        ["area", "slot-10", "unknown-capacity"].includes(location.id),
      ),
      levels,
      balances: [],
      materials,
      warehouses,
    });

    expect(suggestions.map((suggestion) => suggestion.location.id)).toEqual([
      "slot-10",
      "unknown-capacity",
    ]);
    expect(suggestions[1]?.status).toBe("unknown_capacity");
    expect(suggestions[1]?.reasons.join(" ")).toContain("Capacidade indeterminada");
  });

  it("uses the same structural group as a preference for transfers", () => {
    const transferLocations = [
      ...locations,
      {
        id: "area-b",
        warehouse_id: "wh",
        parent_id: null,
        level_id: "structure",
        code: "B",
        name: "Área B",
        active: true,
        status: "disponivel",
        capacity: null,
        capacity_unit: null,
      },
      {
        id: "slot-b",
        warehouse_id: "wh",
        parent_id: "area-b",
        level_id: "storage",
        code: "B-01",
        name: "Posição B-01",
        active: true,
        status: "disponivel",
        capacity: 20,
        capacity_unit: "kg",
      },
    ];

    const suggestions = recommendStorageLocations({
      material: materials[0]!,
      requestedQuantity: 5,
      locations: transferLocations,
      levels,
      balances: [],
      materials,
      warehouses,
      preferredLocationId: "slot-2",
    });

    expect(suggestions[0]?.location.id).toBe("slot-10");
    expect(suggestions[0]?.sameStructuralGroup).toBe(true);
    expect(suggestions.find((item) => item.location.id === "slot-b")?.sameStructuralGroup).toBe(false);
  });

  it("does not suggest the source address as a transfer destination", () => {
    const suggestions = recommendStorageLocations({
      material: materials[0]!,
      requestedQuantity: 5,
      locations,
      levels,
      balances: [],
      materials,
      warehouses,
      preferredLocationId: "slot-2",
      excludeLocationId: "slot-2",
    });

    expect(suggestions.map((suggestion) => suggestion.location.id)).not.toContain("slot-2");
  });

  it("does not recommend positions with incompatible category or capacity units", () => {
    const restrictedLocations = locations.map((location) =>
      location.id === "slot-10"
        ? { ...location, allowed_categories: ["madeira"] }
        : location,
    );

    const suggestions = recommendStorageLocations({
      material: materials[0]!,
      requestedQuantity: 5,
      locations: restrictedLocations,
      levels,
      balances: [],
      materials,
      warehouses,
    });

    expect(suggestions.map((suggestion) => suggestion.location.id)).not.toContain("slot-10");
    expect(suggestions.map((suggestion) => suggestion.location.id)).not.toContain("unit-mismatch-slot");
  });
});

describe("buildPickingSequence", () => {
  const pickingBalances: PlanningBalance[] = [
    { material_id: "mat-a", location_id: "slot-2", quantity: 6, lot: "L-02", expiry_date: "2027-06-01" },
    { material_id: "mat-a", location_id: "slot-2", quantity: 3, lot: "L-01", expiry_date: "2026-12-01" },
    { material_id: "mat-a", location_id: "slot-10", quantity: 4, lot: "L-03", expiry_date: null },
    { material_id: "mat-a", location_id: "reserved-slot", quantity: 100, lot: "RES" },
    { material_id: "mat-a", location_id: "blocked-slot", quantity: 100, lot: "BLK" },
    { material_id: "mat-a", location_id: "inactive-slot", quantity: 100, lot: "INA" },
    { material_id: "mat-a", location_id: "area", quantity: 100, lot: "STRUCTURAL" },
    { material_id: "mat-b", location_id: "slot-10", quantity: 100, lot: "OTHER" },
  ];

  it("builds a deterministic, hierarchical sequence and uses earlier known expiry dates first within a position", () => {
    const sequence = buildPickingSequence({
      materialId: "mat-a",
      requestedQuantity: 10,
      locations,
      levels,
      balances: pickingBalances,
      warehouses,
    });

    expect(sequence.complete).toBe(true);
    expect(sequence.plannedQuantity).toBe(10);
    expect(sequence.remainingQuantity).toBe(0);
    expect(sequence.steps.map((step) => ({
      locationCode: step.locationCode,
      lot: step.lot,
      quantityToPick: step.quantityToPick,
    }))).toEqual([
      { locationCode: "A-02", lot: "L-01", quantityToPick: 3 },
      { locationCode: "A-02", lot: "L-02", quantityToPick: 6 },
      { locationCode: "A-10", lot: "L-03", quantityToPick: 1 },
    ]);
  });

  it("keeps an operator-selected picking location and lot at the top of the refreshed preview", () => {
    const sequence = buildPickingSequence({
      materialId: "mat-a",
      requestedQuantity: 1,
      locations,
      levels,
      balances: pickingBalances,
      warehouses,
      preferredLocationId: "slot-10",
      preferredLot: "L-03",
    });

    expect(sequence.steps[0]).toMatchObject({
      locationId: "slot-10",
      lot: "L-03",
      quantityToPick: 1,
    });
  });

  it("does not plan more than available stock and reports the shortage", () => {
    const sequence = buildPickingSequence({
      materialId: "mat-a",
      requestedQuantity: 20,
      locations,
      levels,
      balances: pickingBalances,
      warehouses,
    });

    expect(sequence.plannedQuantity).toBe(13);
    expect(sequence.remainingQuantity).toBe(7);
    expect(sequence.complete).toBe(false);
    expect(sequence.steps.every((step) => step.quantityToPick <= step.availableQuantity)).toBe(true);
  });

  it("excludes reserved, blocked, structural, inactive and other-warehouse stock", () => {
    const sequence = buildPickingSequence({
      materialId: "mat-a",
      requestedQuantity: 500,
      locations,
      levels,
      balances: pickingBalances,
      warehouses,
    });

    const ids = sequence.steps.map((step) => step.locationId);
    expect(ids).not.toContain("reserved-slot");
    expect(ids).not.toContain("blocked-slot");
    expect(ids).not.toContain("inactive-slot");
    expect(ids).not.toContain("area");
    expect(sequence.plannedQuantity).toBe(13);
  });

  it("returns an empty incomplete plan when no quantity is requested", () => {
    const sequence = buildPickingSequence({
      materialId: "mat-a",
      requestedQuantity: 0,
      locations,
      levels,
      balances: pickingBalances,
      warehouses,
    });

    expect(sequence).toMatchObject({
      requestedQuantity: 0,
      plannedQuantity: 0,
      remainingQuantity: 0,
      complete: false,
      steps: [],
    });
  });
});
