import { describe, expect, it } from "vitest";

import {
  getInventoryAccuracy,
  getLatestInventoryCountItems,
  getReplenishmentSuggestions,
} from "@/lib/dashboard-metrics";

describe("getReplenishmentSuggestions", () => {
  it("calculates only the missing quantity up to minimum stock", () => {
    const result = getReplenishmentSuggestions(
      [
        { id: "a", code: "MAT-01", description: "Parafuso", unit: "un", min_stock: 20, status: "ativo" },
        { id: "b", code: "MAT-02", description: "Tinta", unit: "L", min_stock: 5, status: "ativo" },
        { id: "c", code: "MAT-03", description: "Item inativo", unit: "un", min_stock: 10, status: "inativo" },
      ],
      [
        { material_id: "a", quantity: 8 },
        { material_id: "a", quantity: 4 },
        { material_id: "b", quantity: 5 },
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      materialId: "a",
      currentQuantity: 12,
      minimumQuantity: 20,
      suggestedQuantity: 8,
      unit: "un",
    });
  });

  it("treats a material without a balance as zero and never sums different units", () => {
    const result = getReplenishmentSuggestions(
      [
        { id: "a", code: "A", description: "Aço", unit: "kg", min_stock: 4, status: "ativo" },
        { id: "b", code: "B", description: "Caixa", unit: "cx", min_stock: 2, status: "ativo" },
      ],
      [{ material_id: "a", quantity: 1 }],
    );

    expect(result.map((item) => [item.materialId, item.suggestedQuantity])).toEqual([["a", 3], ["b", 2]]);
  });
});

describe("getInventoryAccuracy", () => {
  it("calculates the percentage of count lines without difference", () => {
    expect(getInventoryAccuracy([{ difference: 0 }, { difference: "0" }, { difference: 2 }, { difference: -1 }]))
      .toEqual({ total: 4, accurate: 2, divergent: 2, percentage: 50 });
  });

  it("returns null when no counts exist instead of showing a misleading zero", () => {
    expect(getInventoryAccuracy([])).toBeNull();
  });
});


describe("getLatestInventoryCountItems", () => {
  it("lets a later correct recount replace an older discrepancy without deleting history", () => {
    const oldCount = {
      id: "old-line",
      count_id: "old-session",
      material_id: "material-1",
      location_id: "location-1",
      lot: "LOT-1",
      difference: -3,
      created_at: "2026-11-01T09:00:00.000Z",
    };
    const correctedCount = {
      id: "new-line",
      count_id: "new-session",
      material_id: "material-1",
      location_id: "location-1",
      lot: "LOT-1",
      difference: 0,
      created_at: "2026-11-03T09:00:00.000Z",
    };

    const latest = getLatestInventoryCountItems(
      [oldCount, correctedCount],
      [
        { id: "old-session", status: "concluido", completed_at: "2026-11-01T10:00:00.000Z" },
        { id: "new-session", status: "concluido", completed_at: "2026-11-03T10:00:00.000Z" },
      ],
    );

    expect(latest).toEqual([correctedCount]);
    expect(getInventoryAccuracy(latest)).toEqual({
      total: 1,
      accurate: 1,
      divergent: 0,
      percentage: 100,
    });
    expect([oldCount, correctedCount]).toHaveLength(2);
  });

  it("ignores unfinished sessions and keeps different lots as separate stock lines", () => {
    const latest = getLatestInventoryCountItems(
      [
        { count_id: "open", material_id: "m1", location_id: "l1", lot: "A", difference: -2 },
        { count_id: "done-a", material_id: "m1", location_id: "l1", lot: "A", difference: 0 },
        { count_id: "done-b", material_id: "m1", location_id: "l1", lot: "B", difference: 1 },
      ],
      [
        { id: "open", status: "em_andamento", created_at: "2026-11-04T08:00:00.000Z" },
        { id: "done-a", status: "concluido", completed_at: "2026-11-04T09:00:00.000Z" },
        { id: "done-b", status: "concluido", completed_at: "2026-11-04T09:00:00.000Z" },
      ],
    );

    expect(latest).toHaveLength(2);
    expect(latest.map((item) => item.lot).sort()).toEqual(["A", "B"]);
  });

  it("produces 97.5% from 39 correct latest lines out of 40", () => {
    const sessions = [
      { id: "old", status: "concluido", completed_at: "2026-11-01T10:00:00.000Z" },
      { id: "latest", status: "concluido", completed_at: "2026-11-04T10:00:00.000Z" },
    ];
    const oldItems = Array.from({ length: 40 }, (_, index) => ({
      count_id: "old",
      material_id: `m-${index}`,
      location_id: `l-${index}`,
      lot: "",
      difference: -1,
      created_at: "2026-11-01T09:00:00.000Z",
    }));
    const latestItems = Array.from({ length: 40 }, (_, index) => ({
      count_id: "latest",
      material_id: `m-${index}`,
      location_id: `l-${index}`,
      lot: "",
      difference: index === 39 ? -1 : 0,
      created_at: "2026-11-04T09:00:00.000Z",
    }));

    const latest = getLatestInventoryCountItems([...oldItems, ...latestItems], sessions);
    expect(getInventoryAccuracy(latest)?.percentage).toBe(97.5);
    expect(latest).toHaveLength(40);
  });

  it("filters by session completion date", () => {
    const latest = getLatestInventoryCountItems(
      [
        { count_id: "old", material_id: "m1", location_id: "l1", difference: -1 },
        { count_id: "new", material_id: "m1", location_id: "l1", difference: 0 },
      ],
      [
        { id: "old", status: "concluido", completed_at: "2026-10-01T10:00:00.000Z" },
        { id: "new", status: "concluido", completed_at: "2026-11-04T10:00:00.000Z" },
      ],
      new Date("2026-11-01T00:00:00.000Z").getTime(),
    );

    expect(latest).toHaveLength(1);
    expect(latest[0].count_id).toBe("new");
  });
});
