import {
  assessLocationAllocation,
  getStorageLocationIds,
  summarizeLocationCapacity,
} from "@/lib/warehouse-stock";

export type PlanningWarehouse = {
  id: string;
  name: string;
  code?: string | null;
  active: boolean;
};

export type PlanningLevel = {
  id: string;
  is_storage: boolean;
};

export type PlanningLocation = {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  level_id: string;
  code: string;
  name: string;
  active: boolean;
  status: string;
  capacity: number | string | null;
  capacity_unit: string | null;
  allow_mixed_materials?: boolean;
  allowed_categories?: string[] | null;
};

export type PlanningMaterial = {
  id: string;
  code: string;
  description?: string | null;
  category: string;
  unit: string;
};

export type PlanningBalance = {
  material_id: string;
  location_id: string;
  quantity: number | string | null;
  lot?: string | null;
  expiry_date?: string | null;
};

export type StorageRecommendation = {
  location: PlanningLocation;
  status: "within_capacity" | "unknown_capacity";
  reasons: string[];
  projectedQuantity: number | null;
  remainingCapacity: number | null;
  sameMaterialAlreadyStored: boolean;
  sameStructuralGroup: boolean;
};

export type StorageRecommendationOptions = {
  material: PlanningMaterial;
  requestedQuantity: number;
  locations: PlanningLocation[];
  levels: PlanningLevel[];
  balances: PlanningBalance[];
  materials: PlanningMaterial[];
  warehouses?: PlanningWarehouse[];
  warehouseId?: string;
  preferredLocationId?: string;
  excludeLocationId?: string;
  allowReserved?: boolean;
  limit?: number;
};

const quantityOf = (value: number | string | null | undefined): number => {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
};

const compareAddressCode = (a: string, b: string) =>
  a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });

function getLocationPath(
  locationId: string,
  locationsById: Map<string, PlanningLocation>,
): PlanningLocation[] {
  const path: PlanningLocation[] = [];
  const visited = new Set<string>();
  let current = locationsById.get(locationId);
  while (current && path.length < 20 && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parent_id ? locationsById.get(current.parent_id) : undefined;
  }
  return path;
}

function compareLocationPath(
  left: PlanningLocation,
  right: PlanningLocation,
  locationsById: Map<string, PlanningLocation>,
): number {
  const leftPath = getLocationPath(left.id, locationsById).map((item) => item.code);
  const rightPath = getLocationPath(right.id, locationsById).map((item) => item.code);
  const maxLength = Math.max(leftPath.length, rightPath.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (leftPath[index] === undefined) return -1;
    if (rightPath[index] === undefined) return 1;
    const comparison = compareAddressCode(leftPath[index]!, rightPath[index]!);
    if (comparison !== 0) return comparison;
  }
  return compareAddressCode(left.code, right.code) || left.id.localeCompare(right.id);
}

/**
 * Suggests valid final storage positions without changing balances.
 *
 * The ranking is deliberately explainable: available before reserved (when
 * explicitly allowed), consolidate the same material, prefer the same
 * structural group for transfers, then use best-fit capacity. Unknown capacity
 * is kept as a lower-priority option with an explicit warning. Schematic map
 * coordinates are not treated as physical distances.
 */
export function recommendStorageLocations(
  options: StorageRecommendationOptions,
): StorageRecommendation[] {
  const {
    material,
    requestedQuantity,
    locations,
    levels,
    balances,
    materials,
    warehouses = [],
    warehouseId,
    preferredLocationId,
    excludeLocationId,
    allowReserved = false,
    limit = 5,
  } = options;

  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) return [];

  const activeWarehouseIds = warehouses.length
    ? new Set(warehouses.filter((warehouse) => warehouse.active).map((warehouse) => warehouse.id))
    : new Set(locations.filter((location) => location.active).map((location) => location.warehouse_id));
  const storageLocationIds = getStorageLocationIds(locations, levels, activeWarehouseIds);
  const locationsById = new Map(locations.map((location) => [location.id, location] as const));
  const preferredLocation = preferredLocationId
    ? locationsById.get(preferredLocationId)
    : undefined;

  const candidates: StorageRecommendation[] = [];

  for (const location of locations) {
    if (location.id === excludeLocationId) continue;
    if (!storageLocationIds.has(location.id)) continue;
    if (warehouseId && location.warehouse_id !== warehouseId) continue;
    if (location.status !== "disponivel" && !(allowReserved && location.status === "reservado")) continue;

    const allocation = assessLocationAllocation(
      location,
      material,
      requestedQuantity,
      balances,
      materials,
    );
    if (!allocation.allowed) continue;

    const locationBalances = balances.filter(
      (balance) => balance.location_id === location.id && quantityOf(balance.quantity) > 0,
    );
    const sameMaterialAlreadyStored = locationBalances.some(
      (balance) => balance.material_id === material.id,
    );
    const sameStructuralGroup = Boolean(
      preferredLocation &&
      preferredLocation.parent_id !== null &&
      location.parent_id === preferredLocation.parent_id,
    );
    const capacity = summarizeLocationCapacity(
      location.capacity,
      location.capacity_unit,
      locationBalances.map((balance) => ({
        quantity: balance.quantity,
        unit: materials.find((candidate) => candidate.id === balance.material_id)?.unit ?? null,
      })),
    );

    const reasons: string[] = [];
    if (sameMaterialAlreadyStored) {
      reasons.push("Já armazena este material; favorece a consolidação do estoque.");
    } else {
      reasons.push("Não possui saldo deste material; evita espalhar o item em mais posições.");
    }
    if (sameStructuralGroup) {
      reasons.push("Está no mesmo grupo estrutural do endereço de origem.");
    }
    if (allocation.status === "within_capacity" && allocation.remainingCapacity !== null) {
      reasons.push(
        `Melhor encaixe: após a alocação restariam ${allocation.remainingCapacity} ${location.capacity_unit}.`,
      );
    } else {
      reasons.push("Capacidade indeterminada; exige conferência física pelo operador.");
    }
    if (capacity.overCapacity) {
      reasons.push("A posição já apresenta saldo acima da capacidade cadastrada.");
    }
    if (location.status === "reservado") {
      reasons.push("Endereço reservado; confirme que a finalidade da armazenagem é compatível.");
    }

    candidates.push({
      location,
      status: allocation.status,
      reasons,
      projectedQuantity: allocation.projectedQuantity,
      remainingCapacity: allocation.remainingCapacity,
      sameMaterialAlreadyStored,
      sameStructuralGroup,
    });
  }

  candidates.sort((left, right) => {
    const leftStatus = left.location.status === "disponivel" ? 0 : 1;
    const rightStatus = right.location.status === "disponivel" ? 0 : 1;
    if (leftStatus !== rightStatus) return leftStatus - rightStatus;
    if (left.sameMaterialAlreadyStored !== right.sameMaterialAlreadyStored) {
      return left.sameMaterialAlreadyStored ? -1 : 1;
    }
    if (left.sameStructuralGroup !== right.sameStructuralGroup) {
      return left.sameStructuralGroup ? -1 : 1;
    }
    if (left.status !== right.status) return left.status === "within_capacity" ? -1 : 1;
    if (
      left.remainingCapacity !== null &&
      right.remainingCapacity !== null &&
      left.remainingCapacity !== right.remainingCapacity
    ) {
      return left.remainingCapacity - right.remainingCapacity;
    }
    if (left.remainingCapacity !== null && right.remainingCapacity === null) return -1;
    if (left.remainingCapacity === null && right.remainingCapacity !== null) return 1;
    return compareLocationPath(left.location, right.location, locationsById);
  });

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 5;
  return candidates.slice(0, safeLimit);
}

export type PickingStep = {
  step: number;
  warehouseName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  locationPath: string;
  lot: string;
  expiryDate: string | null;
  availableQuantity: number;
  quantityToPick: number;
};

export type PickingSequence = {
  requestedQuantity: number;
  plannedQuantity: number;
  remainingQuantity: number;
  complete: boolean;
  steps: PickingStep[];
};

/**
 * Builds a repeatable picking sequence from available stock only.
 *
 * Positions are ordered by warehouse and hierarchical address path. Lots at
 * one position are ordered by known expiry date first, then lot. No physical
 * distance is inferred from the schematic map coordinates.
 */
export function buildPickingSequence(options: {
  materialId: string;
  requestedQuantity: number;
  locations: PlanningLocation[];
  levels: PlanningLevel[];
  balances: PlanningBalance[];
  warehouses: PlanningWarehouse[];
}): PickingSequence {
  const { materialId, requestedQuantity, locations, levels, balances, warehouses } = options;
  const requested = Number.isFinite(requestedQuantity) && requestedQuantity > 0
    ? requestedQuantity
    : 0;
  const activeWarehouseIds = new Set(
    warehouses.filter((warehouse) => warehouse.active).map((warehouse) => warehouse.id),
  );
  const storageLocationIds = getStorageLocationIds(locations, levels, activeWarehouseIds);
  const locationsById = new Map(locations.map((location) => [location.id, location] as const));
  const warehousesById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse] as const));

  const availableBalances = balances
    .filter((balance) => {
      const location = locationsById.get(balance.location_id);
      return (
        balance.material_id === materialId &&
        quantityOf(balance.quantity) > 0 &&
        Boolean(location) &&
        storageLocationIds.has(balance.location_id) &&
        location?.status === "disponivel"
      );
    })
    .sort((left, right) => {
      const leftLocation = locationsById.get(left.location_id)!;
      const rightLocation = locationsById.get(right.location_id)!;
      const leftWarehouse = warehousesById.get(leftLocation.warehouse_id)?.name ?? "";
      const rightWarehouse = warehousesById.get(rightLocation.warehouse_id)?.name ?? "";
      const warehouseComparison = compareAddressCode(leftWarehouse, rightWarehouse);
      if (warehouseComparison !== 0) return warehouseComparison;

      const pathComparison = compareLocationPath(leftLocation, rightLocation, locationsById);
      if (pathComparison !== 0) return pathComparison;

      const leftExpiry = left.expiry_date || "9999-12-31";
      const rightExpiry = right.expiry_date || "9999-12-31";
      const expiryComparison = leftExpiry.localeCompare(rightExpiry);
      if (expiryComparison !== 0) return expiryComparison;

      return compareAddressCode(String(left.lot ?? ""), String(right.lot ?? ""));
    });

  const steps: PickingStep[] = [];
  let remaining = requested;

  for (const balance of availableBalances) {
    if (remaining <= 0.0005) break;
    const availableQuantity = quantityOf(balance.quantity);
    const quantityToPick = Math.min(availableQuantity, remaining);
    const location = locationsById.get(balance.location_id)!;
    const path = getLocationPath(location.id, locationsById)
      .map((item) => item.code)
      .join(" / ");

    steps.push({
      step: steps.length + 1,
      warehouseName: warehousesById.get(location.warehouse_id)?.name ?? "Armazém",
      locationId: location.id,
      locationCode: location.code,
      locationName: location.name,
      locationPath: path || location.code,
      lot: String(balance.lot ?? ""),
      expiryDate: balance.expiry_date ?? null,
      availableQuantity,
      quantityToPick,
    });
    remaining = Math.max(0, remaining - quantityToPick);
  }

  const plannedQuantity = steps.reduce((sum, step) => sum + step.quantityToPick, 0);
  const remainingQuantity = Math.max(0, requested - plannedQuantity);

  return {
    requestedQuantity: requested,
    plannedQuantity,
    remainingQuantity,
    complete: requested > 0 && remainingQuantity <= 0.0005,
    steps,
  };
}
