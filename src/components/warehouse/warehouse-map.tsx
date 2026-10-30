import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Filter,
  Layers3,
  MapPin,
  Maximize2,
  Move,
  Package,
  Search,
  Warehouse as WarehouseIcon,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type WarehouseItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

type LevelItem = {
  id: string;
  name: string;
  is_storage: boolean;
};

type LocationItem = {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  level_id: string;
  code: string;
  name: string;
  status: string;
  active: boolean;
  capacity: number | null;
  capacity_unit: string | null;
  pos_x: number | null;
  pos_y: number | null;
  notes?: string | null;
};

type BalanceItem = {
  material_id: string;
  location_id: string;
  quantity: number | string;
  lot?: string | null;
  expiry_date?: string | null;
};

type MaterialItem = {
  id: string;
  code: string;
  description: string;
  unit: string;
  barcode?: string | null;
  min_stock?: number | string | null;
};

type MovementItem = {
  id: string;
  number?: number | string;
  type: string;
  created_at: string;
  material_id: string;
  quantity: number | string;
  from_location_id?: string | null;
  to_location_id?: string | null;
  reason?: string | null;
};

type TaskItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at?: string | null;
  location_id?: string | null;
  material_id?: string | null;
};

type CellPosition = { x: number; y: number };
type StatusFilter = "todos" | "ocupados" | "vazios" | "bloqueados" | "reservados" | "estoque_baixo";

type WarehouseMapProps = {
  warehouses: WarehouseItem[];
  levels: LevelItem[];
  locations: LocationItem[];
  balances: BalanceItem[];
  materials: MaterialItem[];
  movements: MovementItem[];
  tasks: TaskItem[];
  warehouseId: string;
  selectedLocationId: string;
  canManage: boolean;
  saving: boolean;
  onWarehouseChange: (value: string) => void;
  onSelectLocation: (value: string | null) => void;
  onUpdatePosition: (locationId: string, posX: number, posY: number) => Promise<void>;
  onOpenTasks: () => void;
  onOpenMovements: () => void;
};

const GRID_COLUMNS = 4;

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function statusLabel(status: string): string {
  if (status === "bloqueado") return "Bloqueado";
  if (status === "reservado") return "Reservado";
  return "Disponível";
}

function statusClass(status: string): string {
  if (status === "bloqueado") return "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200";
  if (status === "reservado") return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
}

function movementLabel(type: string): string {
  const labels: Record<string, string> = {
    entrada: "Entrada",
    saida: "Saída",
    transferencia: "Transferência",
    ajuste: "Ajuste",
    estorno: "Estorno",
  };
  return labels[type] ?? type;
}

export function WarehouseMap({
  warehouses,
  levels,
  locations,
  balances,
  materials,
  movements,
  tasks,
  warehouseId,
  selectedLocationId,
  canManage,
  saving,
  onWarehouseChange,
  onSelectLocation,
  onUpdatePosition,
  onOpenTasks,
  onOpenMovements,
}: WarehouseMapProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [zoom, setZoom] = useState(85);
  const [editMode, setEditMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState("");

  const activeWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.active),
    [warehouses],
  );
  const selectedWarehouseId =
    warehouseId && activeWarehouses.some((warehouse) => warehouse.id === warehouseId)
      ? warehouseId
      : activeWarehouses[0]?.id ?? "";

  const warehouseLocations = useMemo(
    () =>
      locations.filter(
        (location) => location.active && location.warehouse_id === selectedWarehouseId,
      ),
    [locations, selectedWarehouseId],
  );

  const levelsById = useMemo(
    () => new Map(levels.map((level) => [level.id, level])),
    [levels],
  );
  const materialsById = useMemo(
    () => new Map(materials.map((material) => [material.id, material])),
    [materials],
  );
  const locationsById = useMemo(
    () => new Map(warehouseLocations.map((location) => [location.id, location])),
    [warehouseLocations],
  );

  const childrenByParent = useMemo(() => {
    const result = new Map<string | null, LocationItem[]>();
    for (const location of warehouseLocations) {
      const parentId = location.parent_id ?? null;
      const children = result.get(parentId) ?? [];
      children.push(location);
      result.set(parentId, children);
    }
    for (const children of result.values()) {
      children.sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
    }
    return result;
  }, [warehouseLocations]);

  const positionsByParent = useMemo(() => {
    const result = new Map<string | null, Map<string, CellPosition>>();
    for (const [parentId, siblings] of childrenByParent.entries()) {
      const used = new Set<string>();
      const positions = new Map<string, CellPosition>();
      const ordered = [...siblings].sort((a, b) => {
        const rowDifference = Number(a.pos_y ?? 0) - Number(b.pos_y ?? 0);
        const columnDifference = Number(a.pos_x ?? 0) - Number(b.pos_x ?? 0);
        return rowDifference || columnDifference || a.code.localeCompare(b.code, "pt-BR", { numeric: true });
      });
      let fallbackIndex = 0;
      for (const location of ordered) {
        const savedX = Number(location.pos_x ?? 0);
        const savedY = Number(location.pos_y ?? 0);
        let candidate: CellPosition | null = null;
        if (
          Number.isInteger(savedX) &&
          Number.isInteger(savedY) &&
          savedX >= 1 &&
          savedX <= GRID_COLUMNS &&
          savedY >= 1 &&
          savedY <= 100 &&
          !used.has(savedX + ":" + savedY)
        ) {
          candidate = { x: savedX, y: savedY };
        }
        if (!candidate) {
          let found = false;
          while (!found) {
            const x = (fallbackIndex % GRID_COLUMNS) + 1;
            const y = Math.floor(fallbackIndex / GRID_COLUMNS) + 1;
            fallbackIndex += 1;
            if (!used.has(x + ":" + y)) {
              candidate = { x, y };
              found = true;
            }
          }
        }
        if (candidate) {
          used.add(candidate.x + ":" + candidate.y);
          positions.set(location.id, candidate);
        }
      }
      result.set(parentId, positions);
    }
    return result;
  }, [childrenByParent]);

  const balancesByLocation = useMemo(() => {
    const result = new Map<string, BalanceItem[]>();
    for (const balance of balances) {
      const rows = result.get(balance.location_id) ?? [];
      rows.push(balance);
      result.set(balance.location_id, rows);
    }
    return result;
  }, [balances]);

  const totalByMaterial = useMemo(() => {
    const result = new Map<string, number>();
    for (const balance of balances) {
      result.set(
        balance.material_id,
        (result.get(balance.material_id) ?? 0) + Number(balance.quantity || 0),
      );
    }
    return result;
  }, [balances]);

  const selectedWarehouse = activeWarehouses.find((warehouse) => warehouse.id === selectedWarehouseId);
  const getLocationBalances = (locationId: string) =>
    (balancesByLocation.get(locationId) ?? []).filter((balance) => Number(balance.quantity) > 0);
  const getUnitTotals = (locationId: string) => {
    const totals = new Map<string, number>();
    for (const balance of getLocationBalances(locationId)) {
      const material = materialsById.get(balance.material_id);
      const unit = material?.unit || "un";
      totals.set(unit, (totals.get(unit) ?? 0) + Number(balance.quantity || 0));
    }
    return totals;
  };
  const getQuantityLabel = (locationId: string) => {
    const totals = getUnitTotals(locationId);
    if (!totals.size) return "Sem saldo direto";
    return [...totals.entries()]
      .map(([unit, quantity]) => formatQuantity(quantity) + " " + unit)
      .join(" · ");
  };
  const isLowStock = (locationId: string) =>
    getLocationBalances(locationId).some((balance) => {
      const material = materialsById.get(balance.material_id);
      return material && Number(totalByMaterial.get(material.id) ?? 0) < Number(material.min_stock ?? 0);
    });

  const storageLocations = warehouseLocations.filter(
    (location) => levelsById.get(location.level_id)?.is_storage,
  );
  const occupiedCount = storageLocations.filter(
    (location) => getLocationBalances(location.id).length > 0,
  ).length;
  const blockedCount = storageLocations.filter((location) => location.status === "bloqueado").length;
  const reservedCount = storageLocations.filter((location) => location.status === "reservado").length;
  const lowStockCount = storageLocations.filter((location) => isLowStock(location.id)).length;

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const directMatch = (location: LocationItem) => {
    const locationText = [location.code, location.name, levelsById.get(location.level_id)?.name ?? ""]
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    const materialMatch = getLocationBalances(location.id).some((balance) => {
      const material = materialsById.get(balance.material_id);
      return material
        ? (material.code + " " + material.description + " " + (material.barcode ?? "")).toLocaleLowerCase("pt-BR").includes(normalizedQuery)
        : false;
    });
    const searchMatch =
      !normalizedQuery || locationText.includes(normalizedQuery) || materialMatch;
    const statusMatch =
      statusFilter === "todos" ||
      (statusFilter === "ocupados" && getLocationBalances(location.id).length > 0) ||
      (statusFilter === "vazios" && getLocationBalances(location.id).length === 0) ||
      (statusFilter === "bloqueados" && location.status === "bloqueado") ||
      (statusFilter === "reservados" && location.status === "reservado") ||
      (statusFilter === "estoque_baixo" && isLowStock(location.id));
    return searchMatch && statusMatch;
  };

  const branchMatchCache = new Map<string, boolean>();
  const branchMatches = (locationId: string): boolean => {
    const cached = branchMatchCache.get(locationId);
    if (cached !== undefined) return cached;
    const location = locationsById.get(locationId);
    if (!location) return false;
    const selfMatches = directMatch(location);
    const descendantsMatch = (childrenByParent.get(locationId) ?? []).some((child) =>
      branchMatches(child.id),
    );
    const matched = selfMatches || descendantsMatch;
    branchMatchCache.set(locationId, matched);
    return matched;
  };

  const matchesCount = warehouseLocations.filter((location) => directMatch(location)).length;
  const selectedLocation = locationsById.get(selectedLocationId);
  const selectedPosition = selectedLocation
    ? positionsByParent.get(selectedLocation.parent_id ?? null)?.get(selectedLocation.id)
    : undefined;
  const selectedBalances = selectedLocation ? getLocationBalances(selectedLocation.id) : [];
  const selectedUnitTotals = selectedLocation ? getUnitTotals(selectedLocation.id) : new Map<string, number>();
  const selectedCapacityUnit = String(selectedLocation?.capacity_unit ?? "").trim().toLowerCase();
  const capacityCompatible = Boolean(
    selectedLocation?.capacity &&
      (selectedUnitTotals.size === 0 ||
        (selectedUnitTotals.size === 1 &&
          [...selectedUnitTotals.keys()][0]?.toLowerCase() === selectedCapacityUnit)),
  );
  const selectedQuantity =
    selectedUnitTotals.size === 1 ? ([...selectedUnitTotals.values()][0] ?? 0) : 0;
  const selectedOccupancy =
    selectedLocation?.capacity && capacityCompatible
      ? Math.min(100, Math.round((selectedQuantity / Number(selectedLocation.capacity)) * 100))
      : null;

  const selectedPath = useMemo(() => {
    const path: LocationItem[] = [];
    let current = locationsById.get(selectedLocationId);
    let depth = 0;
    while (current && depth < 20) {
      path.unshift(current);
      current = current.parent_id ? locationsById.get(current.parent_id) : undefined;
      depth += 1;
    }
    return path;
  }, [locationsById, selectedLocationId]);

  const selectedMovements = selectedLocation
    ? movements
        .filter(
          (movement) =>
            movement.from_location_id === selectedLocation.id ||
            movement.to_location_id === selectedLocation.id,
        )
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 5)
    : [];
  const selectedTasks = selectedLocation
    ? tasks
        .filter((task) => task.location_id === selectedLocation.id && task.status !== "concluida")
        .sort(
          (a, b) =>
            new Date(a.due_at ?? "9999-12-31").getTime() -
            new Date(b.due_at ?? "9999-12-31").getTime(),
        )
        .slice(0, 5)
    : [];

  const changePosition = async (
    locationId: string,
    parentId: string | null,
    x: number,
    y: number,
  ) => {
    const current = locationsById.get(locationId);
    if (!current || current.parent_id !== parentId) return;
    const siblings = childrenByParent.get(parentId) ?? [];
    const positions = positionsByParent.get(parentId) ?? new Map<string, CellPosition>();
    const collision = siblings.some((sibling) => {
      if (sibling.id === locationId) return false;
      const position = positions.get(sibling.id);
      return position?.x === x && position?.y === y;
    });
    if (collision) {
      setMapError("Essa posição já está ocupada por outro endereço. Escolha uma célula vazia.");
      return;
    }
    setMapError("");
    try {
      await onUpdatePosition(locationId, x, y);
    } catch (error) {
      setMapError(error instanceof Error ? error.message : "Não foi possível salvar a posição.");
    }
  };

  function renderLocationNode(location: LocationItem, depth: number): ReactNode {
    const children = childrenByParent.get(location.id) ?? [];
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(location.id);
    const position = positionsByParent.get(location.parent_id ?? null)?.get(location.id);
    const directBalances = getLocationBalances(location.id);
    const isSelected = selectedLocationId === location.id;
    const dimmed = !directMatch(location) && normalizedQuery.length > 0;
    const nodeClass =
      location.status === "bloqueado"
        ? "border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20"
        : location.status === "reservado"
          ? "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20"
          : directBalances.length
            ? "border-blue-300 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20"
            : "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20";
    const selectedClass = isSelected ? "ring-2 ring-primary ring-offset-2 border-primary" : "";
    const lowStockClass = isLowStock(location.id) ? "border-amber-500" : "";

    return (
      <article
        key={location.id}
        draggable={editMode && canManage && !saving}
        onDragStart={(event) => {
          if (!editMode || !canManage) return;
          setDraggedId(location.id);
          event.dataTransfer.setData("text/plain", location.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDraggedId(null)}
        className="min-w-0"
        style={{
          gridColumnStart: position?.x ?? 1,
          gridRowStart: position?.y ?? 1,
        }}
      >
        <div
          className={
            "rounded-xl border p-3 shadow-sm transition-all " +
            nodeClass +
            " " +
            selectedClass +
            " " +
            lowStockClass +
            (dimmed ? " opacity-40" : "")
          }
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectLocation(location.id)}
              className="min-w-0 flex-1 text-left"
              aria-pressed={isSelected}
            >
              <span className="block break-words text-sm font-bold">{location.code}</span>
              <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                {location.name}
              </span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border bg-background/80 px-2 py-0.5 text-[10px] font-medium">
                  {levelsById.get(location.level_id)?.name ?? "Nível"}
                </span>
                <span className="rounded-full border bg-background/80 px-2 py-0.5 text-[10px] font-medium">
                  {directBalances.length ? "Com saldo" : hasChildren ? "Estrutura" : "Sem saldo"}
                </span>
              </span>
            </button>
            {hasChildren && (
              <button
                type="button"
                className="rounded-md border bg-background/80 p-1.5"
                title={isCollapsed ? "Expandir estrutura" : "Recolher estrutura"}
                aria-label={isCollapsed ? "Expandir " + location.code : "Recolher " + location.code}
                onClick={() =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(location.id)) next.delete(location.id);
                    else next.add(location.id);
                    return next;
                  })
                }
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className={"rounded-full border px-2 py-0.5 text-[10px] font-semibold " + statusClass(location.status)}>
              {statusLabel(location.status)}
            </span>
            <span className="text-[11px] font-medium text-foreground/80">
              {getQuantityLabel(location.id)}
            </span>
          </div>
          {isLowStock(location.id) && (
            <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              Estoque abaixo do mínimo
            </p>
          )}
          {editMode && canManage && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Move className="h-3 w-3" />
              Arraste para uma célula vazia do mesmo nível
            </div>
          )}
        </div>
        {hasChildren && !isCollapsed && depth < 20 && (
          <div className="ml-3 mt-3 min-w-0 w-full border-l-2 border-dashed border-border pl-3">
            <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Layers3 className="h-3 w-3" />
              Subendereços ({children.length})
            </div>
            {renderBranchGrid(location.id, depth + 1)}
          </div>
        )}
      </article>
    );
  }

  function renderBranchGrid(parentId: string | null, depth: number): ReactNode {
    const siblings = childrenByParent.get(parentId) ?? [];
    if (!siblings.length) return null;
    const positions = positionsByParent.get(parentId) ?? new Map<string, CellPosition>();
    const visibleSiblingIds = new Set(siblings.filter((location) => branchMatches(location.id)).map((location) => location.id));
    const occupiedRows = Math.max(1, ...[...positions.values()].map((position) => position.y));
    const rows = occupiedRows + (editMode ? 1 : 0);
    const cells: ReactNode[] = [];
    for (let y = 1; y <= rows; y += 1) {
      for (let x = 1; x <= GRID_COLUMNS; x += 1) {
        const location = siblings.find((sibling) => {
          const position = positions.get(sibling.id);
          return position?.x === x && position?.y === y;
        });
        if (location) {
          if (visibleSiblingIds.has(location.id)) {
            cells.push(renderLocationNode(location, depth));
          }
        } else if (editMode && canManage) {
          cells.push(
            <div
              key={"empty-" + String(parentId ?? "root") + "-" + x + "-" + y}
              className="min-h-24 rounded-xl border border-dashed border-primary/40 bg-primary/[0.025]"
              style={{ gridColumnStart: x, gridRowStart: y }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (saving) return;
                const locationId = event.dataTransfer.getData("text/plain") || draggedId;
                setDraggedId(null);
                if (!locationId) return;
                void changePosition(locationId, parentId, x, y);
              }}
            >
              <div className="flex h-full min-h-24 items-center justify-center gap-1 p-2 text-center text-[10px] text-muted-foreground">
                <Move className="h-3 w-3" />
                Soltar aqui
              </div>
            </div>,
          );
        }
      }
    }
    return (
      <div
        className="grid min-w-[680px] grid-cols-4 items-start gap-2"
        style={{ gridAutoRows: "minmax(96px, auto)" }}
      >
        {cells}
      </div>
    );
  }

  const totalPositions = storageLocations.length;
  const occupancyRate = totalPositions
    ? Math.round((occupiedCount / totalPositions) * 100)
    : null;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Mapa geral do armazém</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Visualize a hierarquia completa, localize materiais e consulte os endereços sem trocar de nível.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <WarehouseIcon className="h-4 w-4" />
          {selectedWarehouse?.name ?? "Nenhum armazém"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Armazém</span>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-3"
            value={selectedWarehouseId}
            onChange={(event) => {
              onWarehouseChange(event.target.value);
              onSelectLocation(null);
            }}
          >
            {activeWarehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} — {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Pesquisar material ou endereço</span>
          <span className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Código, descrição ou endereço..."
            />
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid min-w-48 flex-1 gap-1 text-xs">
          <span className="font-medium text-muted-foreground">Filtro de visualização</span>
          <span className="relative">
            <Filter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <select
              className="h-9 w-full rounded-lg border bg-background pl-9 pr-3"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="todos">Todos os endereços</option>
              <option value="ocupados">Com saldo</option>
              <option value="vazios">Sem saldo</option>
              <option value="bloqueados">Bloqueados</option>
              <option value="reservados">Reservados</option>
              <option value="estoque_baixo">Materiais abaixo do mínimo</option>
            </select>
          </span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="flex h-9 items-center gap-1 rounded-lg border px-3 text-xs disabled:opacity-40"
            onClick={() => setZoom((value) => Math.max(55, value - 10))}
            disabled={zoom <= 55}
            aria-label="Diminuir zoom"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="flex h-9 min-w-14 items-center justify-center rounded-lg bg-muted px-2 text-xs tabular-nums">
            {zoom}%
          </span>
          <button
            type="button"
            className="flex h-9 items-center gap-1 rounded-lg border px-3 text-xs disabled:opacity-40"
            onClick={() => setZoom((value) => Math.min(125, value + 10))}
            disabled={zoom >= 125}
            aria-label="Aumentar zoom"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-1 rounded-lg border px-3 text-xs"
            onClick={() => setZoom(65)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Enquadrar mapa
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="h-9 rounded-lg border px-3 text-xs"
            onClick={() => setCollapsed(new Set())}
          >
            Expandir tudo
          </button>
          <button
            type="button"
            className="h-9 rounded-lg border px-3 text-xs"
            onClick={() => setCollapsed(new Set(warehouseLocations.map((location) => location.id)))}
          >
            Recolher tudo
          </button>
        </div>
        {canManage && (
          <button
            type="button"
            className={
              "h-9 rounded-lg px-3 text-xs font-semibold " +
              (editMode ? "bg-primary text-primary-foreground" : "border")
            }
            onClick={() => {
              setMapError("");
              setEditMode((value) => !value);
            }}
            disabled={saving}
          >
            <Move className="mr-1 inline h-3.5 w-3.5" />
            {editMode ? "Concluir organização" : "Organizar mapa"}
          </button>
        )}
      </div>

      {editMode && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          Arraste um endereço para uma célula vazia do mesmo nível hierárquico. A posição será salva nos campos visuais já existentes do endereço; os vínculos de estoque e movimentações não serão alterados.
        </div>
      )}
      {mapError && (
        <div role="alert" className="mt-3 flex items-start justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span>{mapError}</span>
          <button type="button" onClick={() => setMapError("")} aria-label="Fechar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Posições de armazenagem", value: String(totalPositions), detail: "Endereços finais configurados" },
          { label: "Posições ocupadas", value: String(occupiedCount), detail: occupancyRate === null ? "Sem posições configuradas" : occupancyRate + "% das posições" },
          { label: "Bloqueadas / reservadas", value: String(blockedCount) + " / " + String(reservedCount), detail: "Situação cadastral do endereço" },
          { label: "Com estoque abaixo do mínimo", value: String(lowStockCount), detail: "Localizações com materiais em alerta" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Legenda:</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Disponível</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Com saldo</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Reservado / alerta</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Bloqueado</span>
        <span>Endereços-pai aparecem como estruturas; a ocupação é calculada nas posições marcadas como armazenagem.</span>
      </div>

      {!selectedWarehouseId ? (
        <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Cadastre um armazém ativo para visualizar a estrutura.
        </div>
      ) : (childrenByParent.get(null) ?? []).length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Não existem endereços ativos cadastrados neste armazém.
        </div>
      ) : (
        <div className="mt-4 max-h-[72vh] overflow-auto rounded-xl border bg-muted/10 p-3 sm:p-4">
          <div
            className="w-full origin-top-left"
            style={{ zoom: zoom / 100 }}
          >
            {renderBranchGrid(null, 0)}
          </div>
        </div>
      )}

      {normalizedQuery && (
        <p className="mt-2 text-xs text-muted-foreground">
          {matchesCount} endereço(s) correspondem diretamente à pesquisa. Os níveis superiores permanecem visíveis para preservar o contexto da localização.
        </p>
      )}

      {selectedLocation && (
        <div className="mt-5 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Endereço selecionado
              </div>
              <h3 className="mt-1 break-words text-lg font-semibold">
                {selectedLocation.code} — {selectedLocation.name}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedPath.map((location) => location.code).join(" / ")}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border p-2"
              onClick={() => onSelectLocation(null)}
              aria-label="Fechar detalhes do endereço"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {editMode && canManage && selectedPosition && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div>
                <p className="text-xs font-semibold">Ajustar posição do endereço</p>
                <p className="text-[10px] text-muted-foreground">Coluna {selectedPosition.x} · Linha {selectedPosition.y}. Use as setas para mover também em dispositivos sem arrastar.</p>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <span />
                <button type="button" className="rounded-md border bg-background p-2" aria-label="Mover para cima" disabled={saving} onClick={() => moveSelected(0, -1)}><ArrowUp className="h-4 w-4" /></button>
                <span />
                <button type="button" className="rounded-md border bg-background p-2" aria-label="Mover para a esquerda" disabled={saving} onClick={() => moveSelected(-1, 0)}><ArrowLeft className="h-4 w-4" /></button>
                <span className="flex items-center justify-center text-[10px] text-muted-foreground">Mover</span>
                <button type="button" className="rounded-md border bg-background p-2" aria-label="Mover para a direita" disabled={saving} onClick={() => moveSelected(1, 0)}><ArrowRight className="h-4 w-4" /></button>
                <span />
                <button type="button" className="rounded-md border bg-background p-2" aria-label="Mover para baixo" disabled={saving} onClick={() => moveSelected(0, 1)}><ArrowDown className="h-4 w-4" /></button>
                <span />
              </div>
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Situação</p>
              <p className="mt-1 text-sm font-semibold">{statusLabel(selectedLocation.status)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Saldo direto</p>
              <p className="mt-1 text-sm font-semibold">{getQuantityLabel(selectedLocation.id)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Capacidade cadastrada</p>
              <p className="mt-1 text-sm font-semibold">
                {selectedLocation.capacity == null
                  ? "Não configurada"
                  : String(selectedLocation.capacity) + " " + String(selectedLocation.capacity_unit ?? "")}
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Ocupação estimada</p>
              <p className="mt-1 text-sm font-semibold">
                {selectedOccupancy === null ? "Não calculada" : selectedOccupancy + "%"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {selectedOccupancy === null ? "Unidades incompatíveis ou capacidade ausente" : "Somente quando as unidades são compatíveis"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Package className="h-4 w-4" /> Materiais armazenados
              </h4>
              {selectedBalances.length ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[440px] text-left text-xs">
                    <thead className="bg-muted/60 text-muted-foreground">
                      <tr>
                        <th className="p-2">Material</th>
                        <th className="p-2">Lote</th>
                        <th className="p-2">Quantidade</th>
                        <th className="p-2">Unidade</th>
                        <th className="p-2">Validade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedBalances.map((balance) => {
                        const material = materialsById.get(balance.material_id);
                        return (
                          <tr key={balance.material_id + ":" + String(balance.lot ?? "")}>
                            <td className="p-2">
                              <strong>{material?.code ?? "Material"}</strong>
                              <span className="ml-1 text-muted-foreground">{material?.description ?? ""}</span>
                            </td>
                            <td className="p-2">{balance.lot || "—"}</td>
                            <td className="p-2 tabular-nums">{formatQuantity(Number(balance.quantity || 0))}</td>
                            <td className="p-2">{material?.unit ?? "—"}</td>
                            <td className="p-2">{balance.expiry_date ? new Date(balance.expiry_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                  Nenhum saldo registrado diretamente neste endereço.
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Clock3 className="h-4 w-4" /> Movimentações recentes
                </h4>
                {selectedMovements.length ? (
                  <div className="space-y-2">
                    {selectedMovements.map((movement) => (
                      <div key={movement.id} className="rounded-lg border p-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{movementLabel(movement.type)} · {movement.number ?? "—"}</strong>
                          <span className="text-muted-foreground">{formatDate(movement.created_at)}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {materialsById.get(movement.material_id)?.code ?? "Material"} · {formatQuantity(Number(movement.quantity || 0))}
                          {movement.reason ? " · " + movement.reason : ""}
                        </p>
                      </div>
                    ))}
                    <button type="button" className="text-xs font-medium text-primary underline" onClick={onOpenMovements}>
                      Abrir módulo de movimentações
                    </button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    Não há movimentações carregadas para este endereço.
                  </p>
                )}
              </div>
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ClipboardList className="h-4 w-4" /> Tarefas relacionadas
                </h4>
                {selectedTasks.length ? (
                  <div className="space-y-2">
                    {selectedTasks.map((task) => (
                      <div key={task.id} className="rounded-lg border p-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <strong>{task.title}</strong>
                          <span className="rounded-full bg-muted px-2 py-0.5">{task.status.replaceAll("_", " ")}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {task.priority} · prazo {formatDate(task.due_at)}
                        </p>
                      </div>
                    ))}
                    <button type="button" className="text-xs font-medium text-primary underline" onClick={onOpenTasks}>
                      Abrir quadro de tarefas
                    </button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    Não há tarefas abertas vinculadas a este endereço.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
