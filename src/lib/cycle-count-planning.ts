export type CycleCountBalance = {
  material_id: string;
  location_id: string;
  lot: string | null;
  quantity: number | string | null;
};

export type CycleCountMaterial = {
  id: string;
  code: string;
  description: string;
  unit: string;
  status?: string | null;
};

export type CycleCountLocation = {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  level_id: string;
  code: string;
  active: boolean;
  status: string;
};

export type CycleCountLevel = {
  id: string;
  is_storage: boolean;
};

export type CycleCountMovement = {
  material_id: string;
  lot: string | null;
  from_location_id: string | null;
  to_location_id: string | null;
  created_at: string;
};

export type CycleCountSession = {
  id: string;
  status: string;
};

export type CycleCountItem = {
  count_id: string;
  material_id: string;
  location_id: string;
  lot: string | null;
  created_at: string;
};

export type CycleCountCandidate = {
  key: string;
  materialId: string;
  materialCode: string;
  materialDescription: string;
  unit: string;
  locationId: string;
  locationCode: string;
  warehouseId: string;
  lot: string;
  expectedQuantity: number;
  lastCountedAt: string | null;
  daysSinceCount: number | null;
  movementsSinceCount: number;
  priority: "alta" | "media" | "rotina";
  reason: string;
  score: number;
};

export type CycleCountPlan = {
  totalEligible: number;
  alreadyCounted: number;
  candidates: CycleCountCandidate[];
  priorityCounts: {
    alta: number;
    media: number;
    rotina: number;
  };
};

const normalized = (value: unknown) => String(value ?? "").trim();
const positiveQuantity = (value: number | string | null) => {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
};

const combinationKey = (materialId: string, locationId: string, lot: string | null | undefined) =>
  [materialId, locationId, normalized(lot)].join("\u001f");

const compareCode = (left: string, right: string) =>
  left.localeCompare(right, "pt-BR", { numeric: true, sensitivity: "base" });

/**
 * Builds a transparent cycle-count queue from existing balances, completed
 * inventory counts and stock movements. It does not reserve stock, change
 * balances, create sessions or write to the database.
 *
 * Ranking favors never-counted combinations, then older counts and lines with
 * more movement activity since their last completed count. This is an
 * operational heuristic, not a monetary ABC classification.
 */
export function buildCycleCountPlan(options: {
  balances: CycleCountBalance[];
  materials: CycleCountMaterial[];
  locations: CycleCountLocation[];
  levels: CycleCountLevel[];
  activeWarehouseIds: Set<string>;
  movements: CycleCountMovement[];
  sessions: CycleCountSession[];
  countItems: CycleCountItem[];
  currentSessionId?: string | null;
  warehouseId?: string | null;
  limit?: number;
  lookbackDays?: number;
  now?: Date;
}): CycleCountPlan {
  const {
    balances,
    materials,
    locations,
    levels,
    activeWarehouseIds,
    movements,
    sessions,
    countItems,
    currentSessionId,
    warehouseId,
    limit = 20,
    lookbackDays = 90,
    now = new Date(),
  } = options;

  const materialsById = new Map(
    materials
      .filter((material) => !material.status || material.status === "ativo" || material.status === "active")
      .map((material) => [material.id, material] as const),
  );
  const locationsById = new Map(locations.map((location) => [location.id, location] as const));
  const parentIds = new Set(
    locations.map((location) => location.parent_id).filter((id): id is string => Boolean(id)),
  );
  const storageLevelIds = new Set(levels.filter((level) => level.is_storage).map((level) => level.id));
  const eligibleLocationIds = new Set(
    locations
      .filter((location) =>
        location.active &&
        activeWarehouseIds.has(location.warehouse_id) &&
        (!warehouseId || location.warehouse_id === warehouseId) &&
        storageLevelIds.has(location.level_id) &&
        !parentIds.has(location.id),
      )
      .map((location) => location.id),
  );

  const completedSessionIds = new Set(
    sessions.filter((session) => session.status === "concluido").map((session) => session.id),
  );
  const lastCountByKey = new Map<string, string>();
  for (const item of countItems) {
    if (!completedSessionIds.has(item.count_id)) continue;
    const key = combinationKey(item.material_id, item.location_id, item.lot);
    const previous = lastCountByKey.get(key);
    if (!previous || new Date(item.created_at).getTime() > new Date(previous).getTime()) {
      lastCountByKey.set(key, item.created_at);
    }
  }

  const countedInCurrentSession = new Set(
    countItems
      .filter((item) => currentSessionId && item.count_id === currentSessionId)
      .map((item) => combinationKey(item.material_id, item.location_id, item.lot)),
  );

  const nowMs = now.getTime();
  const lookbackStart = nowMs - Math.max(1, lookbackDays) * 86400000;
  const eligibleBalances = balances.filter((balance) =>
    positiveQuantity(balance.quantity) > 0 &&
    materialsById.has(balance.material_id) &&
    eligibleLocationIds.has(balance.location_id),
  );
  const allUniqueKeys = new Set(
    eligibleBalances.map((balance) => combinationKey(balance.material_id, balance.location_id, balance.lot)),
  );
  const alreadyCounted = Array.from(allUniqueKeys).filter((key) => countedInCurrentSession.has(key)).length;

  const candidates: CycleCountCandidate[] = [];
  for (const balance of eligibleBalances) {
    const key = combinationKey(balance.material_id, balance.location_id, balance.lot);
    if (countedInCurrentSession.has(key)) continue;

    const material = materialsById.get(balance.material_id);
    const location = locationsById.get(balance.location_id);
    if (!material || !location) continue;

    const lastCountedAt = lastCountByKey.get(key) ?? null;
    const lastCountMs = lastCountedAt ? new Date(lastCountedAt).getTime() : null;
    const daysSinceCount = lastCountMs !== null && Number.isFinite(lastCountMs)
      ? Math.max(0, Math.floor((nowMs - lastCountMs) / 86400000))
      : null;
    const activityStart = lastCountMs !== null && Number.isFinite(lastCountMs)
      ? lastCountMs
      : lookbackStart;
    const lot = normalized(balance.lot);

    const movementsSinceCount = movements.filter((movement) => {
      if (movement.material_id !== balance.material_id) return false;
      if (normalized(movement.lot) !== lot) return false;
      if (movement.from_location_id !== location.id && movement.to_location_id !== location.id) return false;
      const movementMs = new Date(movement.created_at).getTime();
      return Number.isFinite(movementMs) && movementMs > activityStart && movementMs <= nowMs;
    }).length;

    const neverCounted = daysSinceCount === null;
    const priority: CycleCountCandidate["priority"] =
      neverCounted || (daysSinceCount ?? 0) >= 90 || movementsSinceCount >= 10
        ? "alta"
        : (daysSinceCount ?? 0) >= 30 || movementsSinceCount >= 4
          ? "media"
          : "rotina";

    const reasonParts = [
      neverCounted
        ? "Nunca contado em uma sessão concluída"
        : `Última contagem há ${daysSinceCount} dia(s)`,
    ];
    if (movementsSinceCount > 0) {
      reasonParts.push(`${movementsSinceCount} movimentação(ões) desde a última contagem`);
    }

    const score = (neverCounted ? 100000 : (daysSinceCount ?? 0)) + movementsSinceCount * 7;
    candidates.push({
      key,
      materialId: material.id,
      materialCode: material.code,
      materialDescription: material.description,
      unit: material.unit,
      locationId: location.id,
      locationCode: location.code,
      warehouseId: location.warehouse_id,
      lot,
      expectedQuantity: positiveQuantity(balance.quantity),
      lastCountedAt,
      daysSinceCount,
      movementsSinceCount,
      priority,
      reason: reasonParts.join(" · "),
      score,
    });
  }

  candidates.sort((left, right) =>
    right.score - left.score ||
    compareCode(left.locationCode, right.locationCode) ||
    compareCode(left.materialCode, right.materialCode) ||
    compareCode(left.lot, right.lot),
  );

  const priorityCounts = candidates.reduce(
    (counts, candidate) => {
      counts[candidate.priority] += 1;
      return counts;
    },
    { alta: 0, media: 0, rotina: 0 },
  );
  const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 20;

  return {
    totalEligible: allUniqueKeys.size,
    alreadyCounted,
    candidates: candidates.slice(0, safeLimit),
    priorityCounts,
  };
}
