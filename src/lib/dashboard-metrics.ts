export type ReplenishmentMaterial = {
  id: string;
  code: string;
  description: string;
  unit: string;
  min_stock: number | string | null;
  status?: string | null;
};

export type ReplenishmentBalance = {
  material_id: string;
  quantity: number | string | null;
};

export type ReplenishmentSuggestion = {
  materialId: string;
  code: string;
  description: string;
  unit: string;
  currentQuantity: number;
  minimumQuantity: number;
  suggestedQuantity: number;
};

/**
 * Calculates the quantity needed to bring each active material back to its
 * configured minimum stock. It deliberately does not infer reservations,
 * open purchases or unregistered demand.
 */
export function getReplenishmentSuggestions(
  materials: ReplenishmentMaterial[],
  balances: ReplenishmentBalance[],
): ReplenishmentSuggestion[] {
  const currentByMaterial = new Map<string, number>();

  for (const balance of balances) {
    const current = currentByMaterial.get(balance.material_id) ?? 0;
    currentByMaterial.set(balance.material_id, current + Number(balance.quantity ?? 0));
  }

  return materials
    .filter((material) => material.status === "ativo" || material.status === "active")
    .map((material) => {
      const currentQuantity = currentByMaterial.get(material.id) ?? 0;
      const minimumQuantity = Math.max(0, Number(material.min_stock ?? 0));
      const suggestedQuantity = Math.max(0, Number((minimumQuantity - currentQuantity).toFixed(3)));

      return {
        materialId: material.id,
        code: material.code,
        description: material.description,
        unit: material.unit,
        currentQuantity,
        minimumQuantity,
        suggestedQuantity,
      };
    })
    .filter((item) => item.suggestedQuantity > 0)
    .sort((a, b) => {
      const coverageA = a.minimumQuantity > 0 ? a.currentQuantity / a.minimumQuantity : 1;
      const coverageB = b.minimumQuantity > 0 ? b.currentQuantity / b.minimumQuantity : 1;
      return coverageA - coverageB || a.code.localeCompare(b.code, "pt-BR", { numeric: true });
    });
}

export type InventoryAccuracy = {
  total: number;
  accurate: number;
  divergent: number;
  percentage: number;
};

/**
 * Line-based inventory accuracy: count lines with zero difference divided
 * by all count lines in the selected scope and period. Returns null when there
 * is no count evidence to calculate a meaningful percentage.
 */
export function getInventoryAccuracy(
  countItems: Array<{ difference: number | string | null }>,
): InventoryAccuracy | null {
  if (countItems.length === 0) return null;

  const accurate = countItems.filter((item) => Number(item.difference ?? 0) === 0).length;
  const divergent = countItems.length - accurate;

  return {
    total: countItems.length,
    accurate,
    divergent,
    percentage: Number(((accurate / countItems.length) * 100).toFixed(1)),
  };
}
