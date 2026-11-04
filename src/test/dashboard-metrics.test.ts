import { describe, expect, it } from "vitest";

import { getInventoryAccuracy, getReplenishmentSuggestions } from "@/lib/dashboard-metrics";

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
