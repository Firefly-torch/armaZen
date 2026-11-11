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

export type LocationCapacitySummary = {
  status: "unknown" | "incompatible" | "measurable";
  occupiedQuantity: number | null;
  capacity: number | null;
  capacityUnit: string | null;
  percentage: number | null;
  remaining: number | null;
  overCapacity: boolean;
  reason: string | null;
};

export function summarizeLocationCapacity(
  capacityValue: number | string | null,
  capacityUnitValue: string | null,
  balances: Array<{ quantity: number | string | null; unit: string | null }>,
): LocationCapacitySummary {
  const capacity = Number(capacityValue ?? 0);
  const capacityUnit = String(capacityUnitValue ?? "").trim().toLocaleLowerCase("pt-BR");
  if (!Number.isFinite(capacity) || capacity <= 0 || !capacityUnit) {
    return {
      status: "unknown",
      occupiedQuantity: null,
      capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
      capacityUnit: capacityUnit || null,
      percentage: null,
      remaining: null,
      overCapacity: false,
      reason: "Capacidade não cadastrada ou sem unidade.",
    };
  }

  const unitTotals = new Map<string, number>();
  let hasUnknownUnit = false;
  for (const balance of balances) {
    const quantity = quantityOf(balance.quantity);
    if (quantity <= 0) continue;
    const unit = String(balance.unit ?? "").trim().toLocaleLowerCase("pt-BR");
    if (!unit) {
      hasUnknownUnit = true;
      continue;
    }
    unitTotals.set(unit, (unitTotals.get(unit) ?? 0) + quantity);
  }

  if (hasUnknownUnit || unitTotals.size > 1 || (unitTotals.size === 1 && !unitTotals.has(capacityUnit))) {
    return {
      status: "incompatible",
      occupiedQuantity: null,
      capacity,
      capacityUnit,
      percentage: null,
      remaining: null,
      overCapacity: false,
      reason: "Há unidades de medida incompatíveis com a capacidade cadastrada.",
    };
  }

  const occupiedQuantity = unitTotals.get(capacityUnit) ?? 0;
  const percentage = (occupiedQuantity / capacity) * 100;
  return {
    status: "measurable",
    occupiedQuantity,
    capacity,
    capacityUnit,
    percentage,
    remaining: Math.max(0, capacity - occupiedQuantity),
    overCapacity: occupiedQuantity > capacity,
    reason: null,
  };
}

export type AllocationLocation = {
  id: string;
  active: boolean;
  status: string;
  capacity: number | string | null;
  capacity_unit: string | null;
  allow_mixed_materials?: boolean;
  allowed_categories?: string[] | null;
};

export type AllocationMaterial = {
  id: string;
  category: string;
  unit: string;
};

export type AllocationBalance = {
  material_id: string;
  location_id: string;
  quantity: number | string | null;
};

export type LocationAllocationAssessment = {
  allowed: boolean;
  status: "blocked" | "unknown_capacity" | "within_capacity";
  message: string;
  currentQuantity: number | null;
  projectedQuantity: number | null;
  remainingCapacity: number | null;
};

export function assessLocationAllocation(
  location: AllocationLocation,
  material: AllocationMaterial,
  requestedQuantity: number,
  balances: AllocationBalance[],
  materials: AllocationMaterial[],
): LocationAllocationAssessment {
  const blocked = (message: string): LocationAllocationAssessment => ({
    allowed: false,
    status: "blocked",
    message,
    currentQuantity: null,
    projectedQuantity: null,
    remainingCapacity: null,
  });

  if (!location.active) return blocked("O endereço está inativo.");
  if (location.status === "bloqueado") return blocked("O endereço está bloqueado para novas alocações.");
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return blocked("Informe uma quantidade maior que zero.");
  }

  const allowedCategories = (location.allowed_categories ?? [])
    .map((category) => String(category).trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean);
  if (
    allowedCategories.length > 0 &&
    !allowedCategories.includes(String(material.category).trim().toLocaleLowerCase("pt-BR"))
  ) {
    return blocked(`A categoria "${material.category}" não é permitida neste endereço.`);
  }

  const currentBalances = balances.filter(
    (balance) => balance.location_id === location.id && Number(balance.quantity ?? 0) > 0,
  );
  if (
    location.allow_mixed_materials === false &&
    currentBalances.some((balance) => balance.material_id !== material.id)
  ) {
    return blocked("O endereço aceita apenas um material e já contém outro material.");
  }

  const capacity = Number(location.capacity ?? 0);
  const capacityUnit = String(location.capacity_unit ?? "").trim().toLocaleLowerCase("pt-BR");
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return {
      allowed: true,
      status: "unknown_capacity",
      message: "Capacidade não cadastrada: a ocupação é indeterminada e não deve ser interpretada como espaço livre.",
      currentQuantity: null,
      projectedQuantity: null,
      remainingCapacity: null,
    };
  }
  if (!capacityUnit) {
    return blocked("A capacidade cadastrada não possui unidade. Corrija o endereço antes de alocar estoque.");
  }
  if (String(material.unit).trim().toLocaleLowerCase("pt-BR") !== capacityUnit) {
    return blocked(`Unidade incompatível: capacidade em "${location.capacity_unit}" e material em "${material.unit}". Não há conversão automática.`);
  }

  const materialsById = new Map(materials.map((item) => [item.id, item] as const));
  let currentQuantity = 0;
  for (const balance of currentBalances) {
    const existingMaterial = materialsById.get(balance.material_id);
    const existingUnit = String(existingMaterial?.unit ?? "").trim().toLocaleLowerCase("pt-BR");
    if (!existingUnit || existingUnit !== capacityUnit) {
      return blocked("O endereço já contém saldo com unidade incompatível. Confira os registros antes de receber mais materiais.");
    }
    currentQuantity += quantityOf(balance.quantity);
  }

  const projectedQuantity = currentQuantity + requestedQuantity;
  if (projectedQuantity > capacity) {
    return {
      allowed: false,
      status: "blocked",
      message: `Capacidade excedida: ocupação projetada de ${projectedQuantity} ${location.capacity_unit}, acima do limite de ${capacity} ${location.capacity_unit}.`,
      currentQuantity,
      projectedQuantity,
      remainingCapacity: Math.max(0, capacity - currentQuantity),
    };
  }

  return {
    allowed: true,
    status: "within_capacity",
    message: `Após a movimentação: ${projectedQuantity} de ${capacity} ${location.capacity_unit} (${Math.max(0, capacity - projectedQuantity)} ${location.capacity_unit} restantes).`,
    currentQuantity,
    projectedQuantity,
    remainingCapacity: Math.max(0, capacity - projectedQuantity),
  };
}

export type DescendantOccupancySummary = {
  averagePercent: number | null;
  measurablePositions: number;
  totalPositions: number;
  occupiedPositions: number;
  overCapacityPositions: number;
  unknownCapacityPositions: number;
  incompatiblePositions: number;
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
  let overCapacityPositions = 0;
  let unknownCapacityPositions = 0;
  let incompatiblePositions = 0;

  for (const position of positions) {
    const positionHasBalance = position.balances.some((balance) => quantityOf(balance.quantity) > 0);
    if (positionHasBalance) occupiedPositions += 1;

    const summary = summarizeLocationCapacity(
      position.capacity,
      position.capacity_unit,
      position.balances,
    );
    if (summary.status === "unknown") {
      unknownCapacityPositions += 1;
    } else if (summary.status === "incompatible") {
      incompatiblePositions += 1;
    } else if (summary.percentage !== null) {
      percentages.push(summary.percentage);
      if (summary.overCapacity) overCapacityPositions += 1;
    }
  }

  return {
    averagePercent: percentages.length
      ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length)
      : null,
    measurablePositions: percentages.length,
    totalPositions: positions.length,
    occupiedPositions,
    overCapacityPositions,
    unknownCapacityPositions,
    incompatiblePositions,
  };
}
