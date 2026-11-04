export type StockLocation = {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  level_id: string;
  active: boolean;
  status: string;
};

export type StockLevel = {
  id: string;
  is_storage: boolean;
};

export type StockBalance = {
  material_id: string;
  location_id: string;
  quantity: number | string | null;
};

export type MaterialStockSummary = {
  materialId: string;
  availableQuantity: number;
  reservedQuantity: number;
  blockedQuantity: number;
  structuralQuantity: number;
  inactiveQuantity: number;
  reviewQuantity: number;
  totalQuantity: number;
};

const quantityOf = (value: number | string | null): number => {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
};

/**
 * A storage position must be active, belong to an active warehouse, use a
 * level configured for storage, and have no child address. A parent is a
 * structural node even if its level was mistakenly marked as a storage level.
 */
export function getStorageLocationIds(
  locations: StockLocation[],
  levels: StockLevel[],
  activeWarehouseIds?: Set<string>,
): Set<string> {
  const parentIds = new Set(
    locations.map((location) => location.parent_id).filter((id): id is string => Boolean(id)),
  );
  const storageLevelIds = new Set(levels.filter((level) => level.is_storage).map((level) => level.id));

  return new Set(
    locations
      .filter((location) =>
        location.active &&
        storageLevelIds.has(location.level_id) &&
        !parentIds.has(location.id) &&
        (!activeWarehouseIds || activeWarehouseIds.has(location.warehouse_id)),
      )
      .map((location) => location.id),
  );
}

/**
 * Separates physical stock by operational availability. The registered total
 * is retained for reconciliation, but only valid, available storage positions
 * are considered usable for replenishment and operational availability.
 */
export function summarizeMaterialBalances(
  materials: Array<{ id: string }>,
  locations: StockLocation[],
  levels: StockLevel[],
  balances: StockBalance[],
  activeWarehouseIds?: Set<string>,
): Map<string, MaterialStockSummary> {
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const storageLocationIds = getStorageLocationIds(locations, levels, activeWarehouseIds);
  const summaries = new Map<string, MaterialStockSummary>(
    materials.map((material) => [material.id, {
      materialId: material.id,
      availableQuantity: 0,
      reservedQuantity: 0,
      blockedQuantity: 0,
      structuralQuantity: 0,
      inactiveQuantity: 0,
      reviewQuantity: 0,
      totalQuantity: 0,
    }]),
  );

  for (const balance of balances) {
    const summary = summaries.get(balance.material_id);
    if (!summary) continue;
    const quantity = quantityOf(balance.quantity);
    if (quantity === 0) continue;

    summary.totalQuantity += quantity;
    const location = locationsById.get(balance.location_id);
    const warehouseIsInactive = Boolean(
      location && activeWarehouseIds && !activeWarehouseIds.has(location.warehouse_id),
    );

    if (!location || !location.active || warehouseIsInactive) {
      summary.inactiveQuantity += quantity;
    } else if (!storageLocationIds.has(location.id)) {
      summary.structuralQuantity += quantity;
    } else if (location.status === "reservado") {
      summary.reservedQuantity += quantity;
    } else if (location.status === "bloqueado") {
      summary.blockedQuantity += quantity;
    } else {
      summary.availableQuantity += quantity;
    }
  }

  for (const summary of summaries.values()) {
    summary.reviewQuantity = summary.structuralQuantity + summary.inactiveQuantity;
  }

  return summaries;
}


export type DescendantStoragePosition = {
  capacity: number | string | null;
  capacity_unit: string | null;
  balances: Array<{
    quantity: number | string | null;
    unit: string | null;
  }>;
};

export type DescendantOccupancySummary = {
  averagePercent: number | null;
  measurablePositions: number;
  totalPositions: number;
  occupiedPositions: number;
};

/**
 * Aggregates structural-parent occupancy from its final storage descendants.
 * Percentages are averaged per position, so incompatible units (kg, L, un)
 * are never added together. Positions without a compatible positive capacity
 * are shown in the coverage count but omitted from the average.
 */
export function summarizeDescendantOccupancy(
  positions: DescendantStoragePosition[],
): DescendantOccupancySummary {
  const percentages: number[] = [];
  let occupiedPositions = 0;

  for (const position of positions) {
    const unitTotals = new Map<string, number>();
    let positionQuantity = 0;

    for (const balance of position.balances) {
      const quantity = quantityOf(balance.quantity);
      if (quantity <= 0) continue;
      positionQuantity += quantity;
      const unit = String(balance.unit ?? "").trim().toLocaleLowerCase("pt-BR");
      if (!unit) continue;
      unitTotals.set(unit, (unitTotals.get(unit) ?? 0) + quantity);
    }

    if (positionQuantity > 0) occupiedPositions += 1;

    const capacity = Number(position.capacity ?? 0);
    const capacityUnit = String(position.capacity_unit ?? "").trim().toLocaleLowerCase("pt-BR");
    if (!Number.isFinite(capacity) || capacity <= 0 || !capacityUnit) continue;
    if (unitTotals.size > 1) continue;
    if (unitTotals.size === 1 && !unitTotals.has(capacityUnit)) continue;

    const compatibleQuantity = unitTotals.size === 0 ? 0 : unitTotals.get(capacityUnit) ?? 0;
    percentages.push(Math.min(100, (compatibleQuantity / capacity) * 100));
  }

  return {
    averagePercent: percentages.length
      ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
      : null,
    measurablePositions: percentages.length,
    totalPositions: positions.length,
    occupiedPositions,
  };
}
