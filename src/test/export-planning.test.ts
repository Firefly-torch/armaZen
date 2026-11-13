import { describe, expect, it } from "vitest";
import {
  getDefaultExportColumnName,
  resolveExportRows,
  validateExportRows,
} from "@/lib/export-planning";

describe("export-planning", () => {
  it("uses readable column names for foreign keys", () => {
    expect(getDefaultExportColumnName("material_id")).toBe("codigo_material");
    expect(getDefaultExportColumnName("location_id")).toBe("codigo_endereco");
    expect(getDefaultExportColumnName("quantity")).toBe("quantity");
  });

  it("replaces internal identifiers with material and address codes", () => {
    const result = resolveExportRows(
      "balances",
      [{ material_id: "material-uuid", location_id: "location-uuid", quantity: 12 }],
      {
        materials: new Map([["material-uuid", "MP-001"]]),
        locations: new Map([["location-uuid", "EXT-C01-P01"]]),
      },
    );

    expect(result.rows).toEqual([
      { material_id: "MP-001", location_id: "EXT-C01-P01", quantity: 12 },
    ]);
    expect(result.unresolvedReferences).toBe(0);
  });

  it("does not leak an unresolved UUID and counts the unresolved reference", () => {
    const result = resolveExportRows(
      "balances",
      [{ material_id: "unknown-uuid", location_id: "location-uuid", quantity: 12 }],
      { locations: new Map([["location-uuid", "EXT-C01-P01"]]) },
    );

    expect(result.rows[0]?.material_id).toBe("");
    expect(result.unresolvedReferences).toBe(1);
  });

  it("reports missing mandatory columns and empty mandatory values", () => {
    const validation = validateExportRows(
      "balances",
      ["material_id", "quantity"],
      [
        { material_id: "MP-001", quantity: 12 },
        { material_id: "", quantity: 4 },
      ],
    );

    expect(validation.missingSelection).toEqual(["location_id"]);
    expect(validation.missingValues).toBe(1);
    expect(validation.missingByField).toEqual([
      { field: "material_id", label: "Código do material", rows: 1 },
    ]);
  });
});
