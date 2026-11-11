export type HierarchyFilterLocation = {
  id: string;
  parent_id: string | null;
  level_id: string;
  code: string;
  name: string;
};

export type HierarchyFilterLevel = {
  id: string;
  name: string;
  sort_order: number;
};

export type HierarchyFilterStep = {
  depth: number;
  label: string;
  selectedId: string;
  options: HierarchyFilterLocation[];
};

/**
 * Builds one selector per level of the currently selected branch.
 * The next selector only appears after its parent has been selected, so the
 * same control works for warehouses with different hierarchy names/depths.
 */
export function buildWarehouseHierarchyFilterSteps(
  locations: HierarchyFilterLocation[],
  levels: HierarchyFilterLevel[],
  selectedPath: string[],
): HierarchyFilterStep[] {
  const childrenByParent = new Map<string | null, HierarchyFilterLocation[]>();

  for (const location of locations) {
    const siblings = childrenByParent.get(location.parent_id) ?? [];
    siblings.push(location);
    childrenByParent.set(location.parent_id, siblings);
  }

  const levelNames = new Map<string, string>(
    [...levels]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"))
      .map((level) => [level.id, level.name] as const),
  );
  const sortByCode = (a: HierarchyFilterLocation, b: HierarchyFilterLocation) =>
    a.code.localeCompare(b.code, "pt-BR", { numeric: true }) ||
    a.name.localeCompare(b.name, "pt-BR");

  const steps: HierarchyFilterStep[] = [];
  let options = [...(childrenByParent.get(null) ?? [])].sort(sortByCode);

  for (let depth = 0; depth < 20 && options.length > 0; depth += 1) {
    const levelIds = [...new Set(options.map((location) => location.level_id))];
    const label =
      levelIds.length === 1
        ? levelNames.get(levelIds[0]) ?? `Nível ${depth + 1}`
        : `Nível ${depth + 1}`;
    const requestedId = selectedPath[depth] ?? "";
    const selectedLocation = options.find((location) => location.id === requestedId);

    steps.push({
      depth,
      label,
      selectedId: selectedLocation?.id ?? "",
      options,
    });

    if (!selectedLocation) break;
    options = [...(childrenByParent.get(selectedLocation.id) ?? [])].sort(sortByCode);
  }

  return steps;
}

/** Returns true when a location is the selected branch root or one of its descendants. */
export function isLocationWithinBranch(
  locationId: string,
  branchId: string,
  locationsById: ReadonlyMap<string, HierarchyFilterLocation>,
): boolean {
  if (!branchId) return true;

  let current = locationsById.get(locationId);
  const visited = new Set<string>();

  for (let depth = 0; current && depth < 20 && !visited.has(current.id); depth += 1) {
    if (current.id === branchId) return true;
    visited.add(current.id);
    current = current.parent_id ? locationsById.get(current.parent_id) : undefined;
  }

  return false;
}
