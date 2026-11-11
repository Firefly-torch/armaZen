import { describe, expect, it } from "vitest";
import {
  buildCycleCountPlan,
  type CycleCountBalance,
  type CycleCountItem,
  type CycleCountLocation,
  type CycleCountMaterial,
  type CycleCountMovement,
} from "@/lib/cycle-count-planning";

const materials: CycleCountMaterial[] = [
  { id: "m1", code: "MAT-01", description: "Material 1", unit: "un", status: "ativo" },
  { id: "m2", code: "MAT-02", description: "Material 2", unit: "kg", status: "ativo" },
  { id: "inactive", code: "MAT-X", description: "Inativo", unit: "un", status: "inativo" },
];

const locations: CycleCountLocation[] = [
  { id: "parent", warehouse_id: "wh", parent_id: null, level_id: "structure", code: "A", active: true, status: "disponivel" },
  { id: "slot-10", warehouse_id: "wh", parent_id: "parent", level_id: "storage", code: "A-10", active: true, status: "disponivel" },
  { id: "slot-2", warehouse_id: "wh", parent_id: "parent", level_id: "storage", code: "A-2", active: true, status: "disponivel" },
  { id: "blocked", warehouse_id: "wh", parent_id: "parent", level_id: "storage", code: "A-3", active: true, status: "bloqueado" },
  { id: "inactive-slot", warehouse_id: "wh", parent_id: "parent", level_id: "storage", code: "A-4", active: false, status: "disponivel" },
  { id: "other-wh", warehouse_id: "wh-2", parent_id: null, level_id: "storage", code: "B-1", active: true, status: "disponivel" },
];

const balances: CycleCountBalance[] = [
  { material_id: "m1", location_id: "slot-10", lot: "L-10", quantity: 8 },
  { material_id: "m1", location_id: "slot-2", lot: "L-02", quantity: 5 },
  { material_id: "m2", location_id: "blocked", lot: "", quantity: 20 },
  { material_id: "m1", location_id: "inactive-slot", lot: "", quantity: 10 },
  { material_id: "m1", location_id: "other-wh", lot: "", quantity: 9 },
  { material_id: "inactive", location_id: "slot-2", lot: "", quantity: 2 },
  { material_id: "m1", location_id: "slot-2", lot: "ZERO", quantity: 0 },
];

const baseOptions = {
  balances,
  materials,
  locations,
  levels: [{ id: "structure", is_storage: false }, { id: "storage", is_storage: true }],
  activeWarehouseIds: new Set(["wh"]),
  movements: [] as CycleCountMovement[],
  sessions: [] as Array<{ id: string; status: string }>,
  countItems: [] as CycleCountItem[],
  now: new Date("2026-11-11T12:00:00.000Z"),
};

describe("buildCycleCountPlan", () => {
  it("includes only positive balances in active final storage positions, including blocked positions", () => {
    const plan = buildCycleCountPlan(baseOptions);
    expect(plan.totalEligible).toBe(3);
    expect(plan.candidates.map((item) => item.locationId)).toContain("blocked");
    expect(plan.candidates.map((item) => item.locationId)).not.toContain("parent");
    expect(plan.candidates.map((item) => item.locationId)).not.toContain("inactive-slot");
    expect(plan.candidates.map((item) => item.locationId)).not.toContain("other-wh");
    expect(plan.candidates.map((item) => item.materialId)).not.toContain("inactive");
    expect(plan.candidates.some((item) => item.expectedQuantity === 0)).toBe(false);
  });

  it("prioritizes combinations never counted in a completed session", () => {
    const plan = buildCycleCountPlan({
      ...baseOptions,
      sessions: [{ id: "done", status: "concluido" }, { id: "open", status: "em_andamento" }],
      countItems: [
        { count_id: "done", material_id: "m1", location_id: "slot-2", lot: "L-02", created_at: "2026-10-20T12:00:00.000Z" },
        { count_id: "open", material_id: "m1", location_id: "slot-10", lot: "L-10", created_at: "2026-11-01T12:00:00.000Z" },
      ],
    });

    expect(plan.candidates.find((item) => item.locationId === "slot-10")?.lastCountedAt).toBeNull();
    expect(plan.candidates.find((item) => item.locationId === "slot-10")?.lastCountedAt).toBeNull();
    expect(plan.candidates.find((item) => item.locationId === "slot-2")?.daysSinceCount).toBe(22);
  });

  it("raises priority when a lot has movement activity after its last completed count", () => {
    const movements: CycleCountMovement[] = Array.from({ length: 10 }, (_, index) => ({
      material_id: "m1",
      lot: "L-02",
      from_location_id: index % 2 === 0 ? "slot-2" : null,
      to_location_id: index % 2 === 1 ? "slot-2" : null,
      created_at: `2026-10-${String(index + 21).padStart(2, "0")}T12:00:00.000Z`,
    }));

    const plan = buildCycleCountPlan({
      ...baseOptions,
      sessions: [{ id: "done", status: "concluido" }],
      countItems: [
        { count_id: "done", material_id: "m1", location_id: "slot-2", lot: "L-02", created_at: "2026-10-20T12:00:00.000Z" },
      ],
      movements,
    });

    const target = plan.candidates.find((item) => item.locationId === "slot-2" && item.lot === "L-02");
    expect(target?.movementsSinceCount).toBe(10);
    expect(target?.priority).toBe("alta");
  });

  it("excludes combinations already counted in the currently selected session", () => {
    const plan = buildCycleCountPlan({
      ...baseOptions,
      currentSessionId: "current",
      countItems: [
        { count_id: "current", material_id: "m1", location_id: "slot-10", lot: "L-10", created_at: "2026-11-11T10:00:00.000Z" },
      ],
    });

    expect(plan.alreadyCounted).toBe(1);
    expect(plan.candidates.map((item) => item.locationId)).not.toContain("slot-10");
  });

  it("sorts address codes numerically and respects the requested limit", () => {
    const plan = buildCycleCountPlan({ ...baseOptions, limit: 2 });
    expect(plan.candidates).toHaveLength(2);
    // All new lines have the same priority; numeric ordering puts A-2 before A-3.
    expect(plan.candidates.map((item) => item.locationCode)).toEqual(["A-2", "A-3"]);
  });

  it("filters by the session warehouse", () => {
    const plan = buildCycleCountPlan({ ...baseOptions, warehouseId: "wh-2" });
    expect(plan.totalEligible).toBe(0);
    expect(plan.candidates).toHaveLength(0);
  });
});
