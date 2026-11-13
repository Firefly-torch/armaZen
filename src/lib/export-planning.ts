export type ExportDataset = "materials" | "balances" | "locations" | "movements" | "counts" | "tasks";
export type ExportReferenceKind = "materials" | "locations" | "warehouses" | "levels" | "sessions" | "users";
export type ExportReferenceMaps = Partial<Record<ExportReferenceKind, ReadonlyMap<string, string>>>;

export const mandatoryExportFields: Record<ExportDataset, string[]> = {
  materials: ["code", "description", "category", "unit"],
  balances: ["material_id", "location_id", "quantity"],
  locations: ["code", "name", "warehouse_id"],
  movements: ["type", "material_id", "quantity"],
  counts: ["count_id", "material_id", "location_id", "counted_qty", "reason"],
  tasks: ["title", "type", "status"],
};

export const exportFieldLabels: Record<string, string> = {
  code: "Código do material",
  description: "Descrição",
  category: "Categoria",
  unit: "Unidade",
  barcode: "Código de barras",
  min_stock: "Estoque mínimo",
  status: "Situação",
  tracks_lot: "Controla lote",
  created_at: "Data de criação",
  material_id: "Código do material",
  location_id: "Código do endereço",
  lot: "Lote",
  quantity: "Quantidade em estoque",
  expiry_date: "Validade",
  updated_at: "Última atualização",
  name: "Nome do endereço",
  warehouse_id: "Código do armazém",
  level_id: "Nível de armazenagem",
  parent_id: "Endereço superior",
  capacity: "Capacidade",
  capacity_unit: "Unidade da capacidade",
  active: "Ativo",
  notes: "Observações",
  number: "Número da movimentação",
  type: "Tipo",
  from_location_id: "Endereço de origem",
  to_location_id: "Endereço de destino",
  reason: "Motivo",
  reference: "Referência",
  user_id: "Responsável pela movimentação",
  count_id: "Sessão de inventário",
  expected_qty: "Quantidade registrada antes da contagem",
  counted_qty: "Quantidade física contada",
  difference: "Diferença encontrada",
  title: "Título da tarefa",
  priority: "Prioridade",
  assignee_id: "Responsável pela tarefa",
  due_at: "Prazo",
};

const defaultColumnNames: Record<string, string> = {
  material_id: "codigo_material",
  location_id: "codigo_endereco",
  warehouse_id: "codigo_armazem",
  level_id: "nivel_armazenagem",
  parent_id: "codigo_endereco_superior",
  from_location_id: "codigo_endereco_origem",
  to_location_id: "codigo_endereco_destino",
  user_id: "responsavel",
  count_id: "sessao_inventario",
  assignee_id: "responsavel_tarefa",
};

const referenceFields: Record<ExportDataset, Record<string, ExportReferenceKind>> = {
  materials: {},
  balances: { material_id: "materials", location_id: "locations" },
  locations: { warehouse_id: "warehouses", level_id: "levels", parent_id: "locations" },
  movements: {
    material_id: "materials",
    from_location_id: "locations",
    to_location_id: "locations",
    user_id: "users",
  },
  counts: {
    count_id: "sessions",
    material_id: "materials",
    location_id: "locations",
    user_id: "users",
  },
  tasks: {
    assignee_id: "users",
    material_id: "materials",
    location_id: "locations",
  },
};

export function getDefaultExportColumnName(field: string): string {
  return defaultColumnNames[field] ?? field;
}

export function getExportFieldLabel(field: string, dataset?: ExportDataset): string {
  if (field === "code" && dataset === "locations") return "Código do endereço";
  if (field === "code" && dataset === "materials") return "Código do material";
  if (field === "quantity" && dataset === "balances") return "Quantidade em estoque";
  if (field === "quantity" && dataset === "movements") return "Quantidade movimentada";
  return exportFieldLabels[field] ?? field.replace(/_/g, " ");
}

/**
 * Replace organization-internal foreign keys with stable, human-readable
 * business identifiers before a file is generated. An unresolved reference
 * becomes an empty value and is reported instead of leaking a raw UUID.
 */
export function resolveExportRows(
  dataset: ExportDataset,
  rows: Array<Record<string, unknown>>,
  references: ExportReferenceMaps,
): { rows: Array<Record<string, unknown>>; unresolvedReferences: number } {
  const datasetReferences = referenceFields[dataset];
  let unresolvedReferences = 0;

  const resolvedRows = rows.map((row) => {
    const resolved: Record<string, unknown> = { ...row };

    for (const [field, kind] of Object.entries(datasetReferences)) {
      const value = row[field];
      if (value == null || String(value).trim() === "") {
        resolved[field] = "";
        continue;
      }

      const displayValue = references[kind]?.get(String(value));
      if (displayValue == null || displayValue.trim() === "") {
        resolved[field] = "";
        unresolvedReferences += 1;
      } else {
        resolved[field] = displayValue;
      }
    }

    return resolved;
  });

  return { rows: resolvedRows, unresolvedReferences };
}

export function validateExportRows(
  dataset: ExportDataset,
  selectedFields: string[],
  rows: Array<Record<string, unknown>>,
): {
  missingSelection: string[];
  missingValues: number;
  missingByField: Array<{ field: string; label: string; rows: number }>;
} {
  const requiredFields = mandatoryExportFields[dataset];
  const missingSelection = requiredFields.filter((field) => !selectedFields.includes(field));
  const missingByField = requiredFields
    .filter((field) => selectedFields.includes(field))
    .map((field) => ({
      field,
      label: getExportFieldLabel(field, dataset),
      rows: rows.filter((row) => row[field] == null || String(row[field]).trim() === "").length,
    }))
    .filter((item) => item.rows > 0);

  return {
    missingSelection,
    missingValues: missingByField.reduce((total, item) => total + item.rows, 0),
    missingByField,
  };
}
