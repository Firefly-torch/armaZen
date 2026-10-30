/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import {
  Activity, AlertTriangle, ArrowLeftRight, Boxes, CheckCircle2, ClipboardCheck,
  ClipboardList, Download, LayoutDashboard, MapPinned, Package, Plus, RefreshCw,
  ShieldCheck, Warehouse, Pencil, Search, Ban, Check, Users, GripVertical, MapPin, CalendarClock,
} from "lucide-react";
import { WarehouseMap } from "@/components/warehouse/warehouse-map";
import { supabase } from "@/integrations/supabase/client";
import { startDemoSession, type DemoRole } from "@/integrations/supabase/admin-auth";
import type { User } from "@supabase/supabase-js";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "armaZen — Controle de estoque e operações" },
      { name: "description", content: "Gestão de armazéns, materiais, movimentações, tarefas operacionais e exportações do armaZen." },
      { property: "og:title", content: "armaZen — Controle de estoque e operações" },
      { property: "og:description", content: "Consulte estoques, endereços, movimentações e tarefas no sistema de gestão de armazém armaZen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Section = "dashboard" | "warehouse" | "materials" | "movements" | "inventory" | "tasks" | "exports" | "settings";
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = any; // untyped database rows in this prototype; keeps dot access allowed
const db = supabase as any;

const nav: { id: Section; label: string; icon: typeof Boxes }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "warehouse", label: "Armazém e endereçamento", icon: Warehouse },
  { id: "materials", label: "Materiais e estoque", icon: Package },
  { id: "movements", label: "Movimentações", icon: ArrowLeftRight },
  { id: "inventory", label: "Inventário", icon: ClipboardCheck },
  { id: "tasks", label: "Tarefas operacionais", icon: ClipboardList },
  { id: "exports", label: "Exportação para ERP", icon: Download },
  { id: "settings", label: "Usuários e configurações", icon: ShieldCheck },
];
const movementTypes = ["entrada", "saida", "transferencia", "ajuste"] as const;
const taskTypes = ["recebimento", "conferencia", "armazenagem", "separacao", "transferencia", "inventario", "expedicao"];
const taskStatuses = ["a_fazer", "em_andamento", "aguardando", "concluida"];
const priorities = ["baixa", "media", "alta", "urgente"];
const reservedDemoEmails = new Set([
  "demo.consulta@armazen.app",
  "demo.operacao@armazen.app",
  "demo.gestao@armazen.app",
]);
const locationStatuses = ["disponivel", "bloqueado", "reservado"];
const datasets: Record<string, { label: string; table: string; fields: string[] }> = {
  materials: { label: "Materiais", table: "materials", fields: ["code", "description", "category", "unit", "barcode", "min_stock", "status", "tracks_lot", "created_at"] },
  balances: { label: "Saldos de estoque", table: "inventory_balances", fields: ["material_id", "location_id", "lot", "quantity", "expiry_date", "updated_at"] },
  locations: { label: "Endereços", table: "locations", fields: ["code", "name", "warehouse_id", "level_id", "parent_id", "status", "capacity", "capacity_unit", "active", "notes"] },
  movements: { label: "Movimentações", table: "stock_movements", fields: ["number", "type", "created_at", "material_id", "quantity", "from_location_id", "to_location_id", "lot", "reason", "reference", "notes", "user_id"] },
  counts: { label: "Inventário", table: "inventory_count_items", fields: ["count_id", "material_id", "location_id", "lot", "expected_qty", "counted_qty", "difference", "reason", "created_at", "user_id"] },
  tasks: { label: "Tarefas", table: "tasks", fields: ["title", "description", "type", "priority", "status", "assignee_id", "due_at", "material_id", "location_id", "created_at"] },
};
const mandatoryExportFields: Record<string, string[]> = {
  materials: ["code", "description", "category", "unit"],
  balances: ["material_id", "location_id", "quantity"],
  locations: ["code", "name", "warehouse_id"],
  movements: ["type", "material_id", "quantity"],
  counts: ["count_id", "material_id", "location_id", "counted_qty", "reason"],
  tasks: ["title", "type", "status"],
};

function Field({ label, value, onChange, type = "text", required = false, placeholder, min, step }: {
  label: string; value: string | number; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string; min?: number; step?: number;
}) {
  return <label className="grid gap-1.5 text-sm"><span className="font-medium">{label}</span><input className="h-10 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring" type={type} value={value} required={required} placeholder={placeholder} min={min} step={step} onChange={(e) => onChange(e.target.value)} /></label>;
}
function SelectField({ label, value, onChange, options, required = false }: {
  label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; required?: boolean;
}) {
  return <label className="grid gap-1.5 text-sm"><span className="font-medium">{label}</span><select className="h-10 w-full rounded-lg border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring" value={value} required={required} onChange={(e) => onChange(e.target.value)}><option value="">Selecione...</option>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
function Panel({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="min-w-0 w-full max-w-full rounded-xl border bg-card p-3 shadow-sm sm:p-5"><div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words font-semibold">{title}</h2>{description && <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>}</div>{action && <div className="max-w-full shrink-0">{action}</div>}</div>{children}</section>;
}
function Empty({ children = "Nenhum registro encontrado." }: { children?: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
function Table({ headers, rows, pageSize = 10 }: { headers: string[]; rows: ReactNode[][]; pageSize?: number }) {
  const [page, setPage] = useState(0);
  if (!rows.length) return <Empty />;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <div className="min-w-0 w-full max-w-full space-y-3">
    <div className="hidden min-w-0 max-w-full overflow-x-auto rounded-lg border sm:block">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr>{headers.map(h => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{visibleRows.map((row, i) => <tr key={currentPage * pageSize + i} className="odd:bg-white even:bg-slate-50/80 hover:bg-primary/5 dark:odd:bg-slate-950/30 dark:even:bg-slate-900/40">{row.map((cell, j) => <td key={j} className="max-w-[22rem] px-3 py-3 align-middle"><div className="min-w-0 break-words [overflow-wrap:anywhere]">{cell}</div></td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="grid min-w-0 gap-3 sm:hidden">
      {visibleRows.map((row, i) => <article key={currentPage * pageSize + i} className="min-w-0 overflow-hidden rounded-xl border-2 border-slate-300 border-l-4 border-l-primary bg-card p-3 shadow-md ring-1 ring-slate-200/70 dark:border-slate-600 dark:ring-slate-800">
        <dl className="grid min-w-0 gap-2.5">
          {row[0] !== undefined && <div className="min-w-0 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-primary">{headers[0]}</dt>
            <dd className="mt-1 min-w-0 break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere] [&_div.flex]:flex-wrap">{row[0]}</dd>
          </div>}
          {row.slice(1).map((cell, j) => <div key={j + 1} className="grid min-w-0 gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 odd:bg-white dark:border-slate-700 dark:bg-slate-900/40 dark:odd:bg-slate-950/30">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{headers[j + 1]}</dt>
            <dd className="min-w-0 break-words text-sm text-foreground [overflow-wrap:anywhere] [&_div.flex]:flex-wrap">{cell}</dd>
          </div>)}
        </dl>
      </article>)}
    </div>
    {rows.length > pageSize && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, rows.length)} de {rows.length} registros</span>
      <div className="flex gap-2">
        <button type="button" aria-label="Página anterior" disabled={currentPage === 0} onClick={() => setPage(Math.max(0, currentPage - 1))} className="rounded-md border px-3 py-2 disabled:opacity-40">Anterior</button>
        <button type="button" aria-label="Próxima página" disabled={currentPage >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))} className="rounded-md border px-3 py-2 disabled:opacity-40">Próxima</button>
      </div>
    </div>}
  </div>;
}
const pretty = (v: unknown) => v == null || v === "" ? "—" : String(v);
const dateLabel = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString("pt-BR") : "—";
const errorMessage = (e: unknown) => e instanceof Error ? e.message : "Não foi possível concluir a operação.";
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function buildExportBlob(
  format: string,
  rows: AnyRow[],
  delimiter: string,
  dateFormat: string,
): { blob: Blob; extension: string } {
  const columns = Object.keys(rows[0] ?? {});
  const normalizedRows = rows.map((row) => Object.fromEntries(columns.map((column) => {
    const value = row[column];
    if (dateFormat !== "BR" || typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) {
      return [column, value];
    }
    const date = new Date(value.includes("T") ? value : value.slice(0, 10) + "T12:00:00");
    if (Number.isNaN(date.getTime())) return [column, value];
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hasTime = value.includes("T");
    const time = hasTime ? ` ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` : "";
    return [column, `${day}/${month}/${year}${time}`];
  })));

  if (format === "json") {
    return { blob: new Blob([JSON.stringify(normalizedRows, null, 2)], { type: "application/json;charset=utf-8" }), extension: "json" };
  }
  if (format === "xlsx") {
    const sheet = XLSX.utils.json_to_sheet(normalizedRows, { header: columns });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Dados");
    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    return { blob: new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), extension: "xlsx" };
  }

  const escapeCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [
    columns.map(escapeCell).join(delimiter),
    ...normalizedRows.map((row) => columns.map((column) => escapeCell(row[column])).join(delimiter)),
  ].join("\r\n");
  return { blob: new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), extension: "csv" };
}

// Demo access is passwordless for three reserved, fictitious role accounts.
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [busyRole, setBusyRole] = useState<DemoRole | null>(null);
  const [err, setErr] = useState("");

  const profiles: { role: DemoRole; title: string; description: string; actions: string; Icon: typeof Warehouse }[] = [
    { role: "consulta", title: "Consulta", description: "Visualize indicadores, materiais, saldos, endereços, movimentações e tarefas.", actions: "Acesso somente para leitura", Icon: Search },
    { role: "operacao", title: "Operação", description: "Consulte o estoque, registre movimentações e contagens e atualize tarefas.", actions: "Rotinas operacionais", Icon: ClipboardCheck },
    { role: "gestao", title: "Gestão", description: "Administre armazéns, materiais, equipe, configurações e exportações.", actions: "Acesso administrativo", Icon: ShieldCheck },
  ];

  const handleDemoLogin = async (role: DemoRole) => {
    setBusyRole(role);
    setErr("");
    try {
      const result = await startDemoSession({ data: { role } });
      const { error } = await supabase.auth.verifyOtp({
        token_hash: result.tokenHash,
        type: "magiclink",
      });
      if (error) throw error;
      onLogin();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusyRole(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Warehouse className="h-8 w-8" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Ambiente de demonstração</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">armaZen</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Explore o sistema com três perfis prontos. Cada acesso usa uma conta própria e permissões correspondentes à rotina demonstrada.</p>
        </div>
        {err && <div role="alert" className="mx-auto mb-5 max-w-3xl rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{err}</div>}
        <div className="grid gap-4 md:grid-cols-3">
          {profiles.map(({ role, title, description, actions, Icon }) => <article key={role} className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
            <h2 className="text-lg font-semibold">Acessar como {title}</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
            <p className="mb-4 mt-4 rounded-md bg-muted px-3 py-2 text-xs font-medium">{actions}</p>
            <button type="button" disabled={busyRole !== null} onClick={() => void handleDemoLogin(role)} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">
              {busyRole === role ? "Preparando acesso…" : `Entrar como ${title}`}
            </button>
          </article>)}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">As contas utilizam dados fictícios compartilhados entre os perfis. Não insira informações reais neste ambiente.</p>
        <p className="mt-2 text-center text-xs text-muted-foreground">Protótipo acadêmico · armaZen</p>
      </div>
    </div>
  );
}

function Index() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = loading
  const [section, setSection] = useState<Section>("dashboard");
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [role, setRole] = useState("");
  const [members, setMembers] = useState<AnyRow[]>([]);
  const [warehouses, setWarehouses] = useState<AnyRow[]>([]);
  const [levels, setLevels] = useState<AnyRow[]>([]);
  const [locations, setLocations] = useState<AnyRow[]>([]);
  const [materials, setMaterials] = useState<AnyRow[]>([]);
  const [balances, setBalances] = useState<AnyRow[]>([]);
  const [movements, setMovements] = useState<AnyRow[]>([]);
  const [tasks, setTasks] = useState<AnyRow[]>([]);
  const [templates, setTemplates] = useState<AnyRow[]>([]);
  const [history, setHistory] = useState<AnyRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AnyRow[]>([]);
  const [counts, setCounts] = useState<AnyRow[]>([]);
  const [inventorySessions, setInventorySessions] = useState<AnyRow[]>([]);
  const [materialAttributes, setMaterialAttributes] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [dataError, setDataError] = useState("");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [period, setPeriod] = useState("30");
  const [dashboardWarehouseId, setDashboardWarehouseId] = useState("todos");
  const [materialFilters, setMaterialFilters] = useState({ status: "todos", stock: "todos" });
  const [movementFilters, setMovementFilters] = useState({ type: "todos", material_id: "todos", location_id: "todos", user_id: "todos", fromDate: "", toDate: "" });
  const [mapWarehouseId, setMapWarehouseId] = useState("");
  const [mapSelectedLocationId, setMapSelectedLocationId] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [inventoryForm, setInventoryForm] = useState({ warehouse_id: "todos", description: "" });
  const [attributeForm, setAttributeForm] = useState({ id: "", key: "", label: "", data_type: "text", required: false });
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverTaskStatus, setDragOverTaskStatus] = useState<string | null>(null);

  const refresh = useCallback(() => setReload(n => n + 1), []);
  const notify = (msg: string) => { setMessage(msg); setDataError(""); };
  const fail = (e: unknown) => { setDataError(errorMessage(e)); setMessage(""); };

  useEffect(() => {
    let alive = true;
    try {
      supabase.auth.getSession().then(({ data }) => { if (alive) setUser(data.session?.user ?? null); })
        .catch(() => { if (alive) { setUser(null); setDataError("Não foi possível verificar a sessão do Supabase."); } });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        if (!session) { setOrgId(""); setOrgName(""); setRole(""); setSection("dashboard"); }
      });
      return () => { alive = false; data.subscription.unsubscribe(); };
    } catch (e) { setDataError(errorMessage(e)); setUser(null); return () => { alive = false; }; }
  }, []);

  useEffect(() => {
    if (!user) { setOrgId(""); setOrgName(""); setRole(""); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await db.from("organization_members").select("org_id, role, organizations(name)").eq("user_id", user.id);
      if (error) throw error;
      if (cancelled) return;
      const row = data?.[0];
      if (!row) {
        // Never silently create an organization or elevate an unlinked user to Gestão.
        setOrgId("");
        setOrgName("");
        setRole("");
        setDataError("Esta conta não está vinculada a uma organização. Entre por um dos três perfis de demonstração.");
        return;
      }
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
      setOrgId(row.org_id); setOrgName(org?.name ?? "Organização"); setRole(row.role);
    })().catch(e => { if (!cancelled) fail(e); });
    return () => { cancelled = true; };
  }, [user]);

  // All hooks must be called before any conditional return.
  // This effect was previously placed after a conditional return (violating Rules of Hooks).
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true); setDataError("");
    const load = async () => {
      const get = (table: string, order = "created_at") => db.from(table).select("*").eq("org_id", orgId).order(order, { ascending: false }).limit(1000);
      try {
        const results = await Promise.all([
          get("warehouses"), get("location_levels", "sort_order"), get("locations"), get("materials"),
          get("inventory_balances", "updated_at"), get("stock_movements"), get("tasks"),
          get("export_templates"),
          role === "gestao" ? get("export_history") : Promise.resolve({ data: [], error: null }),
          role === "gestao" ? get("audit_logs") : Promise.resolve({ data: [], error: null }),
          get("inventory_count_items"), get("inventory_counts"), get("material_attributes"),
          db.from("organization_members").select("id, user_id, role, created_at").eq("org_id", orgId).order("created_at", { ascending: true }),
        ]);
        const failed = results.find((r: AnyRow) => r.error);
        if (failed?.error) throw failed.error;
        if (cancelled) return;
        setWarehouses(results[0].data ?? []); setLevels(results[1].data ?? []); setLocations(results[2].data ?? []);
        setMaterials(results[3].data ?? []); setBalances(results[4].data ?? []); setMovements(results[5].data ?? []);
        setTasks(results[6].data ?? []); setTemplates(results[7].data ?? []); setHistory(results[8].data ?? []);
        setAuditLogs(results[9].data ?? []);
        setCounts(results[10].data ?? []);
        setInventorySessions(results[11].data ?? []);
        setMaterialAttributes(results[12].data ?? []);
        const memberRows = results[13].data ?? [];
        const userIds = memberRows.map((m: AnyRow) => m.user_id);
        let profileRows: AnyRow[] = [];
        if (userIds.length) {
          const profileResult = await db.from("profiles").select("id, email, full_name").in("id", userIds);
          if (!profileResult.error) profileRows = profileResult.data ?? [];
        }
        setMembers(memberRows.map((m: AnyRow) => ({ ...m, profiles: profileRows.find(p => p.id === m.user_id) ?? null })));
      } catch (e) { if (!cancelled) fail(e); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [orgId, reload, role]);

  // Form state hooks — must be declared before conditional returns
  const [whForm, setWhForm] = useState({ id:"", code:"", name:"", description:"" });
  const [levelForm, setLevelForm] = useState({ id:"", warehouse_id:"", name:"", sort_order:"1", is_storage:true });
  const [locForm, setLocForm] = useState({ id:"", warehouse_id:"", level_id:"", parent_id:"", code:"", name:"", status:"disponivel", capacity:"", capacity_unit:"un", notes:"" });
  const [matForm, setMatForm] = useState({ id:"", code:"", description:"", category:"Geral", unit:"un", barcode:"", min_stock:"0", status:"ativo", tracks_lot:false, attributes:"{}" });
  const [moveForm, setMoveForm] = useState({ type:"entrada", material_id:"", quantity:"1", from_location_id:"", to_location_id:"", lot:"", reference:"", reason:"", notes:"" });
  const [taskForm, setTaskForm] = useState({ id:"", title:"", description:"", type:"recebimento", priority:"media", status:"a_fazer", assignee_id:"", due_at:"", material_id:"", location_id:"" });
  const [memberForm, setMemberForm] = useState({ email:"", role:"operacao" });
  const [exportForm, setExportForm] = useState({ dataset:"materials", format:"csv", template_id:"", template_name:"", delimiter:";", date_format:"ISO" });
  const [selectedFields, setSelectedFields] = useState<string[]>(datasets["materials"]!.fields);
  const [preview, setPreview] = useState<AnyRow[]>([]);
  const [exportFieldMappings, setExportFieldMappings] = useState<Record<string, string>>({});
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");
  const [exportMissingValues, setExportMissingValues] = useState(0);
  const [exportMissingRequired, setExportMissingRequired] = useState(0);

  useEffect(() => {
    setSelectedFields(datasets[exportForm.dataset]?.fields ?? []);
    setExportFieldMappings({});
    setPreview([]);
    setExportMissingValues(0);
    setExportMissingRequired(0);
  }, [exportForm.dataset]);

  useEffect(() => {
    if (!inventorySessions.some((session) => session.id === selectedInventoryId)) {
      setSelectedInventoryId(inventorySessions[0]?.id ?? "");
    }
  }, [inventorySessions, selectedInventoryId]);

  // Warehouse-scoped, unit-aware indicators; never add kg, L and units together.
  const totals = useMemo(() => {
    const scopedLocations = locations.filter((location) =>
      dashboardWarehouseId === "todos" || location.warehouse_id === dashboardWarehouseId
    );
    const scopedLocationIds = new Set(scopedLocations.map((location) => location.id));
    const scopedBalances = balances.filter((balance) =>
      dashboardWarehouseId === "todos" || scopedLocationIds.has(balance.location_id)
    );
    const balanceByMaterial = new Map<string, number>();
    const quantityByUnit = new Map<string, number>();
    scopedBalances.forEach((balance) => {
      const quantity = Number(balance.quantity || 0);
      balanceByMaterial.set(balance.material_id, (balanceByMaterial.get(balance.material_id) ?? 0) + quantity);
      const unit = materials.find((material) => material.id === balance.material_id)?.unit || "un";
      quantityByUnit.set(unit, (quantityByUnit.get(unit) ?? 0) + quantity);
    });
    const since = Date.now() - Number(period) * 86400000;
    const scopedMovementsAll = movements.filter((movement) =>
      dashboardWarehouseId === "todos" ||
      scopedLocationIds.has(movement.from_location_id) ||
      scopedLocationIds.has(movement.to_location_id)
    );
    const scopedMovements = scopedMovementsAll.filter((movement) =>
      new Date(movement.created_at).getTime() >= since
    );
    const scopedTasks = tasks.filter((task) =>
      dashboardWarehouseId === "todos" ||
      (task.location_id != null && scopedLocationIds.has(task.location_id))
    );
    const open = scopedTasks.filter((task) => task.status !== "concluida");
    const storageLocations = scopedLocations.filter((location) =>
      location.active && levels.some((level) => level.id === location.level_id && level.is_storage)
    );
    const occupiedLocations = storageLocations.filter((location) =>
      scopedBalances.some((balance) => balance.location_id === location.id && Number(balance.quantity) > 0)
    ).length;
    const unitSummary = [...quantityByUnit.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([unit, quantity]) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(quantity)} ${unit}`)
      .join(" · ");
    const movementDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (6 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return {
        label: date.toLocaleDateString("pt-BR", { weekday: "short" }),
        count: movements.filter((movement) => {
          if (dashboardWarehouseId !== "todos" &&
              !scopedLocationIds.has(movement.from_location_id) &&
              !scopedLocationIds.has(movement.to_location_id)) return false;
          const created = new Date(movement.created_at);
          const movementKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
          return movementKey === key;
        }).length,
      };
    });
    return {
      materials: materials.filter((material) => material.status === "ativo" || material.status === "active").length,
      locations: scopedLocations.filter((location) => location.active).length,
      units: unitSummary || "0",
      lowStock: materials.filter((material) =>
        (material.status === "ativo" || material.status === "active") &&
        (balanceByMaterial.get(material.id) ?? 0) < Number(material.min_stock || 0)
      ).length,
      movements: scopedMovements.length,
      movementTypeCounts: ["entrada", "saida", "transferencia", "ajuste", "estorno"].map((type) => ({
        type,
        count: scopedMovementsAll.filter((movement) => movement.type === type).length,
      })),
      pending: open.length,
      overdue: open.filter((task) => task.due_at && new Date(task.due_at).getTime() < Date.now()).length,
      divergences: counts.filter((item) =>
        Number(item.difference) !== 0 &&
        (dashboardWarehouseId === "todos" || scopedLocationIds.has(item.location_id))
      ).length,
      occupancy: storageLocations.length ? Math.round((occupiedLocations / storageLocations.length) * 100) : null,
      occupiedLocations,
      storageLocations: storageLocations.length,
      movementDays,
    };
  }, [materials, locations, levels, balances, movements, tasks, counts, period, dashboardWarehouseId]);

  const selectedMapWarehouseId = mapWarehouseId && warehouses.some((warehouse) => warehouse.id === mapWarehouseId && warehouse.active)
    ? mapWarehouseId
    : warehouses.find((warehouse) => warehouse.active)?.id ?? "";

  useEffect(() => {
    if (!user || role === "consulta") {
      if (section === "inventory" || section === "exports" || section === "settings") setSection("dashboard");
    } else if (role === "operacao" && (section === "exports" || section === "settings")) {
      setSection("dashboard");
    }
  }, [user, role, section]);

  // Show loading splash while checking session
  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Warehouse className="h-8 w-8" />
          </div>
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      </div>
    );
  }

  // Not authenticated — show login screen
  if (user === null) {
    return <LoginScreen onLogin={() => {}} />;
  }

  const canOperate = Boolean(user && orgId && role !== "consulta");
  const canManage = role === "gestao";
  const isDemoWorkspace = members.some((member) =>
    reservedDemoEmails.has(String(member.profiles?.email ?? "").toLowerCase())
  );
  const visibleNav = nav.filter((item) => {
    if (canManage) return true;
    if (item.id === "exports" || item.id === "settings") return false;
    if (item.id === "inventory") return role === "operacao";
    return true;
  });
  const roleLabel = role === "gestao" ? "Gestão" : role === "operacao" ? "Operação" : role === "consulta" ? "Consulta" : "Não identificado";
  const filtered = (rows: AnyRow[], keys: string[]) => rows.filter(row => keys.some(k => String(row[k] ?? "").toLowerCase().includes(search.toLowerCase())));
  const runSave = async (fn: () => Promise<unknown>, success: string) => {
    if (!user || !orgId) { fail(new Error("É necessário haver uma sessão autenticada vinculada a uma organização para gravar dados.")); return; }
    setSaving(true); setMessage(""); setDataError("");
    try { await fn(); notify(success); refresh(); }
    catch (e) { fail(e); }
    finally { setSaving(false); }
  };
  const statusPill = (text: string) => <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{text.replaceAll("_", " ")}</span>;

  const dashboard = <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-base font-semibold">Indicadores operacionais</h2><p className="mt-1 text-sm text-muted-foreground">Indicadores calculados a partir dos dados salvos no Supabase.</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <SelectField label="Período" value={period} onChange={setPeriod} options={[{value:"7",label:"7 dias"},{value:"30",label:"30 dias"},{value:"90",label:"90 dias"}]} />
        <SelectField label="Armazém" value={dashboardWarehouseId} onChange={setDashboardWarehouseId} options={[{value:"todos",label:"Todos os armazéns"},...warehouses.filter(w=>w.active).map(w=>({value:w.id,label:w.name}))]} />
        <button onClick={refresh} disabled={loading} className="flex h-10 items-center gap-2 rounded-lg border px-3 text-sm"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</button>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Materiais ativos", totals.materials, Package],
        ["Endereços ativos", totals.locations, MapPinned],
        ["Saldo por unidade", totals.units, Boxes],
        ["Ocupação de posições", totals.occupancy === null ? "Sem posições de armazenagem" : `${totals.occupancy}% · ${totals.occupiedLocations}/${totals.storageLocations}`, Warehouse],
        ["Abaixo do mínimo", totals.lowStock, AlertTriangle],
        [`Movimentações (${period} dias)`, totals.movements, Activity],
        ["Tarefas em aberto", totals.pending, ClipboardList],
        ["Tarefas atrasadas", totals.overdue, AlertTriangle],
        ["Divergências registradas", totals.divergences, CheckCircle2],
      ].map(([label, value, Icon]: any) => <article key={String(label)} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{label}</p><span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span></div><p className="mt-4 break-words text-2xl font-semibold">{orgId ? value : "—"}</p></article>)}
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Movimentações por tipo" description="Distribuição por tipo no armazém selecionado.">
        {totals.movementTypeCounts.map(({type}: any)=>{const count=totals.movementTypeCounts.find((item: AnyRow)=>item.type===type)?.count??0;const max=Math.max(1,...totals.movementTypeCounts.map((item: AnyRow)=>item.count));return <div key={type} className="mb-3"><div className="mb-1 flex justify-between gap-2 text-sm"><span className="capitalize">{type}</span><span>{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${count/max*100}%`}}/></div></div>;})}
      </Panel>
      <Panel title="Situação das tarefas" description="Distribuição das tarefas no escopo selecionado.">
        {taskStatuses.map(status=>{const relevantTasks=tasks.filter(t=>(dashboardWarehouseId==="todos"||(t.location_id&&locations.some(l=>l.id===t.location_id&&l.warehouse_id===dashboardWarehouseId)))&&t.status===status);const count=relevantTasks.length;const max=Math.max(1,...taskStatuses.map(s=>tasks.filter(t=>(dashboardWarehouseId==="todos"||(t.location_id&&locations.some(l=>l.id===t.location_id&&l.warehouse_id===dashboardWarehouseId)))&&t.status===s).length));return <div key={status} className="mb-3"><div className="mb-1 flex justify-between gap-2 text-sm"><span>{status.replaceAll("_"," ")}</span><span>{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${count/max*100}%`}}/></div></div>;})}
      </Panel>
      <Panel title="Situação dos endereços" description="Contagem dos estados cadastrados, não capacidade física.">
        {locationStatuses.map(status=>{const count=locations.filter(l=>l.active&&(dashboardWarehouseId==="todos"||l.warehouse_id===dashboardWarehouseId)&&l.status===status).length;const max=Math.max(1,...locationStatuses.map(s=>locations.filter(l=>l.active&&(dashboardWarehouseId==="todos"||l.warehouse_id===dashboardWarehouseId)&&l.status===s).length));return <div key={status} className="mb-3"><div className="mb-1 flex justify-between gap-2 text-sm"><span>{status.replaceAll("_"," ")}</span><span>{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${count/max*100}%`}}/></div></div>;})}
      </Panel>
    </div>
    <Panel title="Movimentações nos últimos 7 dias" description="Quantidade de registros por dia; não representa volume físico movimentado.">
      <div className="grid grid-cols-7 gap-2 sm:gap-4">
        {totals.movementDays.map((day: AnyRow)=>{const max=Math.max(1,...totals.movementDays.map((item: AnyRow)=>item.count));return <div key={day.label} className="flex min-w-0 flex-col items-center gap-2"><span className="text-xs font-medium tabular-nums">{day.count}</span><div className="flex h-24 w-full items-end rounded-md bg-muted p-1"><div className="w-full rounded-sm bg-primary transition-all" style={{height:`${Math.max(day.count===0?0:8,day.count/max*100)}%`}}/></div><span className="text-[10px] capitalize text-muted-foreground sm:text-xs">{day.label}</span></div>;})}
      </div>
    </Panel>
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Movimentações recentes" description="Últimos registros persistidos no escopo selecionado."><Table headers={["Nº","Tipo","Material","Quantidade","Data"]} rows={movements.filter(m=>dashboardWarehouseId==="todos"||locations.some(l=>l.warehouse_id===dashboardWarehouseId&&(l.id===m.from_location_id||l.id===m.to_location_id))).slice(0,6).map(m => [pretty(m.number), statusPill(m.type), pretty(materials.find(x=>x.id===m.material_id)?.code), `${pretty(m.quantity)} ${materials.find(x=>x.id===m.material_id)?.unit??""}`, dateLabel(m.created_at)])} /></Panel>
      <Panel title="Tarefas prioritárias" description="Tarefas abertas, incluindo prazos vencidos."><Table headers={["Tarefa","Prioridade","Status","Prazo"]} rows={tasks.filter(t=>(dashboardWarehouseId==="todos"||(t.location_id&&locations.some(l=>l.id===t.location_id&&l.warehouse_id===dashboardWarehouseId)))&&t.status!=="concluida").sort((a,b)=>Number(new Date(a.due_at||"9999").getTime())-Number(new Date(b.due_at||"9999").getTime())).slice(0,6).map(t=>[t.title,statusPill(t.priority),statusPill(t.status),dateLabel(t.due_at)])} /></Panel>
    </div>
  </div>;

  const warehouseSection = <div className="space-y-5">
    <Panel title="Armazéns" description="Cadastre instalações genéricas. Desativar preserva vínculos e histórico.">
      {canManage && <form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault(); void runSave(async()=>{const payload={code:whForm.code.trim(),name:whForm.name.trim(),description:whForm.description.trim()||null,org_id:orgId,active:whForm.id?(warehouses.find(w=>w.id===whForm.id)?.active??true):true,updated_at:new Date().toISOString()}; if(whForm.id) {const {error}=await db.from("warehouses").update(payload).eq("id",whForm.id).eq("org_id",orgId);if(error)throw error;} else {const {error}=await db.from("warehouses").insert(payload);if(error)throw error;} setWhForm({id:"",code:"",name:"",description:""});},"Armazém salvo.");}}> <Field label="Código" value={whForm.code} onChange={v=>setWhForm({...whForm,code:v})} required/><Field label="Nome" value={whForm.name} onChange={v=>setWhForm({...whForm,name:v})} required/><Field label="Descrição" value={whForm.description} onChange={v=>setWhForm({...whForm,description:v})}/><div className="flex items-end gap-2"><button disabled={saving} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4"/>{whForm.id?"Salvar edição":"Cadastrar"}</button>{whForm.id&&<button type="button" className="h-10 rounded-lg border px-3 text-sm" onClick={()=>setWhForm({id:"",code:"",name:"",description:""})}>Cancelar</button>}</div></form>}
      <Table headers={["Código","Armazém","Descrição","Situação","Ações"]} rows={warehouses.map(w=>[w.code,w.name,pretty(w.description),w.active?"Ativo":"Inativo",<div className="flex gap-2">{canManage&&<button title="Editar" className="rounded border p-2" onClick={()=>setWhForm({id:w.id,code:w.code,name:w.name,description:w.description??""})}><Pencil className="h-4 w-4"/></button>}{canManage&&<button title={w.active?"Desativar":"Ativar"} className="rounded border p-2" onClick={()=>void runSave(async()=>{const {error}=await db.from("warehouses").update({active:!w.active,updated_at:new Date().toISOString()}).eq("id",w.id).eq("org_id",orgId);if(error)throw error;},"Situação atualizada.")}>{w.active?<Ban className="h-4 w-4"/>:<Check className="h-4 w-4"/>}</button>}</div>])}/>
    </Panel>
    <Panel title="Níveis configuráveis" description="A profundidade da hierarquia é definida pelos níveis e relações pai/filho.">
      {canManage&&<form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const p={org_id:orgId,warehouse_id:levelForm.warehouse_id,name:levelForm.name.trim(),sort_order:Number(levelForm.sort_order),is_storage:levelForm.is_storage};const q=levelForm.id?db.from("location_levels").update(p).eq("id",levelForm.id):db.from("location_levels").insert(p);const {error}=await q;if(error)throw error;setLevelForm({id:"",warehouse_id:"",name:"",sort_order:"1",is_storage:true});},"Nível salvo.");}}><SelectField label="Armazém" value={levelForm.warehouse_id} onChange={v=>setLevelForm({...levelForm,warehouse_id:v})} required options={warehouses.filter(w=>w.active).map(w=>({value:w.id,label:w.name}))}/><Field label="Nome do nível" value={levelForm.name} onChange={v=>setLevelForm({...levelForm,name:v})} required/><Field label="Ordem" type="number" min={0} value={levelForm.sort_order} onChange={v=>setLevelForm({...levelForm,sort_order:v})}/><div className="flex items-end gap-2"><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={levelForm.is_storage} onChange={e=>setLevelForm({...levelForm,is_storage:e.target.checked})}/> É endereço de armazenagem</label><button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={saving}>Salvar nível</button></div></form>}
      <Table headers={["Armazém","Nível","Ordem","Armazenagem","Ações"]} rows={levels.map(l=>[pretty(warehouses.find(w=>w.id===l.warehouse_id)?.name),l.name,l.sort_order,l.is_storage?"Sim":"Não",canManage?<button className="rounded border p-2" title="Editar nível" onClick={()=>setLevelForm({id:l.id,warehouse_id:l.warehouse_id,name:l.name,sort_order:String(l.sort_order),is_storage:l.is_storage})}><Pencil className="h-4 w-4"/></button>:"—"])}/>
    </Panel>
    <Panel title="Endereços" description="Estados: disponível, reservado ou bloqueado. A posição visual é esquemática, não uma planta real.">
      {canManage&&<form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const p={org_id:orgId,warehouse_id:locForm.warehouse_id,level_id:locForm.level_id,parent_id:locForm.parent_id||null,code:locForm.code.trim(),name:locForm.name.trim(),status:locForm.status,capacity:locForm.capacity?Number(locForm.capacity):null,capacity_unit:locForm.capacity_unit||null,notes:locForm.notes||null,active:locForm.id?(locations.find(l=>l.id===locForm.id)?.active??true):true,updated_at:new Date().toISOString()};const q=locForm.id?db.from("locations").update(p).eq("id",locForm.id):db.from("locations").insert(p);const {error}=await q;if(error)throw error;setLocForm({id:"",warehouse_id:"",level_id:"",parent_id:"",code:"",name:"",status:"disponivel",capacity:"",capacity_unit:"un",notes:""});},"Endereço salvo.");}}><SelectField label="Armazém" value={locForm.warehouse_id} onChange={v=>setLocForm({...locForm,warehouse_id:v,level_id:"",parent_id:""})} required options={warehouses.filter(w=>w.active).map(w=>({value:w.id,label:w.name}))}/><SelectField label="Nível" value={locForm.level_id} onChange={v=>setLocForm({...locForm,level_id:v})} required options={levels.filter(l=>l.warehouse_id===locForm.warehouse_id).map(l=>({value:l.id,label:l.name}))}/><SelectField label="Endereço pai" value={locForm.parent_id} onChange={v=>setLocForm({...locForm,parent_id:v})} options={locations.filter(l=>l.warehouse_id===locForm.warehouse_id&&l.id!==locForm.id).map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><Field label="Código" value={locForm.code} onChange={v=>setLocForm({...locForm,code:v})} required/><Field label="Nome" value={locForm.name} onChange={v=>setLocForm({...locForm,name:v})} required/><SelectField label="Situação" value={locForm.status} onChange={v=>setLocForm({...locForm,status:v})} options={locationStatuses.map(v=>({value:v,label:v.replaceAll("_"," ")}))} required/><Field label="Capacidade" type="number" min={0} step={0.01} value={locForm.capacity} onChange={v=>setLocForm({...locForm,capacity:v})}/><Field label="Unidade da capacidade" value={locForm.capacity_unit} onChange={v=>setLocForm({...locForm,capacity_unit:v})}/><Field label="Observações" value={locForm.notes} onChange={v=>setLocForm({...locForm,notes:v})}/><div className="flex items-end gap-2"><button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={saving}>Salvar endereço</button>{locForm.id&&<button type="button" className="h-10 rounded-lg border px-3 text-sm" onClick={()=>setLocForm({id:"",warehouse_id:"",level_id:"",parent_id:"",code:"",name:"",status:"disponivel",capacity:"",capacity_unit:"un",notes:""})}>Cancelar</button>}</div></form>}
      <div className="mb-3 flex gap-2"><Search className="mt-2.5 h-4 w-4 text-muted-foreground"/><input className="h-10 w-full max-w-sm rounded-lg border bg-background px-3 text-sm" placeholder="Pesquisar código, nome ou nível" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <Table headers={["Código","Nome","Armazém / nível","Pai","Situação","Saldo","Ações"]} rows={locations.filter(l=>[l.code,l.name,l.status,levels.find(level=>level.id===l.level_id)?.name,warehouses.find(w=>w.id===l.warehouse_id)?.name,locations.find(parent=>parent.id===l.parent_id)?.code].some(value=>String(value??"").toLowerCase().includes(search.toLowerCase()))).map(l=>{const qty=balances.filter(b=>b.location_id===l.id).reduce((s,b)=>s+Number(b.quantity||0),0);return [l.code,l.name,`${warehouses.find(w=>w.id===l.warehouse_id)?.name??"—"} / ${levels.find(x=>x.id===l.level_id)?.name??"—"}`,pretty(locations.find(x=>x.id===l.parent_id)?.code),statusPill(l.status),qty,canManage?<div className="flex gap-2"><button className="rounded border p-2" onClick={()=>setLocForm({id:l.id,warehouse_id:l.warehouse_id,level_id:l.level_id,parent_id:l.parent_id??"",code:l.code,name:l.name,status:l.status,capacity:l.capacity==null?"":String(l.capacity),capacity_unit:l.capacity_unit??"un",notes:l.notes??""})}><Pencil className="h-4 w-4"/></button><button className="rounded border p-2" title="Desativar endereço" onClick={()=>void runSave(async()=>{if(qty>0)throw new Error("Não é possível desativar um endereço com saldo. Transfira o estoque antes.");const {error}=await db.from("locations").update({active:false,updated_at:new Date().toISOString()}).eq("id",l.id).eq("org_id",orgId);if(error)throw error;},"Endereço desativado.")}><Ban className="h-4 w-4"/></button></div>:"—"]})}/>
    </Panel>
    <WarehouseMap
      warehouses={warehouses}
      levels={levels}
      locations={locations}
      balances={balances}
      materials={materials}
      movements={movements}
      tasks={tasks}
      warehouseId={selectedMapWarehouseId}
      selectedLocationId={mapSelectedLocationId}
      canManage={canManage}
      saving={saving}
      onWarehouseChange={(value) => { setMapWarehouseId(value); setMapSelectedLocationId(""); }}
      onSelectLocation={(value) => setMapSelectedLocationId(value ?? "")}
      onUpdatePosition={(locationId, posX, posY) => runSave(async () => {
        const { error, data } = await db.from("locations")
          .update({ pos_x: posX, pos_y: posY, updated_at: new Date().toISOString() })
          .eq("id", locationId)
          .eq("org_id", orgId)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Endereço não encontrado ou sem permissão para alterar sua posição.");
      }, "Posição visual atualizada.")}
      onSwapPositions={(draggedId, targetId, draggedPosition, targetPosition) => runSave(async () => {
        const draggedLocation = locations.find((location) => location.id === draggedId);
        const targetLocation = locations.find((location) => location.id === targetId);
        if (!draggedLocation || !targetLocation || draggedLocation.parent_id !== targetLocation.parent_id) {
          throw new Error("Os endereços precisam pertencer ao mesmo grupo.");
        }
        const timestamp = new Date().toISOString();
        const first = await db.from("locations")
          .update({ pos_x: targetPosition.x, pos_y: targetPosition.y, updated_at: timestamp })
          .eq("id", draggedId)
          .eq("org_id", orgId)
          .select("id")
          .maybeSingle();
        if (first.error) throw first.error;
        if (!first.data) throw new Error("Não foi possível atualizar o primeiro endereço.");
        const second = await db.from("locations")
          .update({ pos_x: draggedPosition.x, pos_y: draggedPosition.y, updated_at: timestamp })
          .eq("id", targetId)
          .eq("org_id", orgId)
          .select("id")
          .maybeSingle();
        if (second.error || !second.data) {
          const rollback = await db.from("locations")
            .update({ pos_x: draggedPosition.x, pos_y: draggedPosition.y, updated_at: new Date().toISOString() })
            .eq("id", draggedId)
            .eq("org_id", orgId);
          if (rollback.error) {
            throw new Error("A troca ficou incompleta e a reversão automática falhou. Confira as posições dos dois endereços.");
          }
          throw second.error ?? new Error("Não foi possível atualizar o segundo endereço. A primeira alteração foi revertida.");
        }
      }, "Posições dos endereços trocadas.")}
      onOpenTasks={() => setSection("tasks")}
      onOpenMovements={() => setSection("movements")}
    />
  </div>;

  const materialsSection = <div className="space-y-5">
    <Panel title={matForm.id?"Editar material":"Cadastrar material"} description="Os saldos são lidos de inventory_balances; não são editados diretamente nesta tela.">
      {canManage?<form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault();void runSave(async()=>{let storedAttrs:AnyRow={};try{storedAttrs=JSON.parse(matForm.attributes||"{}");if(!storedAttrs||Array.isArray(storedAttrs)||typeof storedAttrs!=="object")throw new Error();}catch{throw new Error("Os atributos já salvos deste material estão inválidos.");}const attrs:AnyRow={...storedAttrs};for(const attribute of materialAttributes){const raw=attributeValues[attribute.key]??String(storedAttrs[attribute.key]??"");if(attribute.required&&!String(raw).trim())throw new Error(`Preencha o campo obrigatório: ${attribute.label}.`);if(!String(raw).trim()){delete attrs[attribute.key];continue;}if(attribute.data_type==="number"){const numeric=Number(raw);if(!Number.isFinite(numeric))throw new Error(`O campo ${attribute.label} precisa ser numérico.`);attrs[attribute.key]=numeric;}else if(attribute.data_type==="boolean"){attrs[attribute.key]=raw==="true";}else{attrs[attribute.key]=raw;}}const p={org_id:orgId,code:matForm.code.trim(),description:matForm.description.trim(),category:matForm.category.trim(),unit:matForm.unit.trim(),barcode:matForm.barcode.trim()||null,min_stock:Number(matForm.min_stock),status:matForm.status,tracks_lot:matForm.tracks_lot,attributes:attrs,updated_at:new Date().toISOString()};const q=matForm.id?db.from("materials").update(p).eq("id",matForm.id):db.from("materials").insert(p);const {error}=await q;if(error)throw error;setMatForm({id:"",code:"",description:"",category:"Geral",unit:"un",barcode:"",min_stock:"0",status:"ativo",tracks_lot:false,attributes:"{}"});setAttributeValues({});},"Material salvo.");}}><Field label="Código interno" value={matForm.code} onChange={v=>setMatForm({...matForm,code:v})} required/><Field label="Descrição" value={matForm.description} onChange={v=>setMatForm({...matForm,description:v})} required/><Field label="Categoria" value={matForm.category} onChange={v=>setMatForm({...matForm,category:v})} required/><Field label="Unidade de medida" value={matForm.unit} onChange={v=>setMatForm({...matForm,unit:v})} required/><Field label="Código de barras (opcional)" value={matForm.barcode} onChange={v=>setMatForm({...matForm,barcode:v})}/><Field label="Estoque mínimo" type="number" min={0} step={0.01} value={matForm.min_stock} onChange={v=>setMatForm({...matForm,min_stock:v})} required/><SelectField label="Status" value={matForm.status} onChange={v=>setMatForm({...matForm,status:v})} options={[{value:"ativo",label:"Ativo"},{value:"inativo",label:"Inativo"}]} required/><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={matForm.tracks_lot} onChange={e=>setMatForm({...matForm,tracks_lot:e.target.checked})}/> Controla lote/validade</label><div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 xl:col-span-4">{materialAttributes.length?materialAttributes.map(attribute=>attribute.data_type==="boolean"?<SelectField key={attribute.key} label={`${attribute.label}${attribute.required?" *":""}`} value={attributeValues[attribute.key]??""} onChange={value=>setAttributeValues(current=>({...current,[attribute.key]:value}))} required={attribute.required} options={[{value:"true",label:"Sim"},{value:"false",label:"Não"}]}/>:<Field key={attribute.key} label={`${attribute.label}${attribute.required?" *":""}`} type={attribute.data_type==="number"?"number":attribute.data_type==="date"?"date":"text"} value={attributeValues[attribute.key]??""} onChange={value=>setAttributeValues(current=>({...current,[attribute.key]:value}))} required={attribute.required}/>):<p className="text-xs text-muted-foreground">A Gestão pode configurar campos adicionais em Usuários e configurações.</p>}</div><div className="flex items-end gap-2"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">{matForm.id?"Salvar alterações":"Cadastrar material"}</button>{matForm.id&&<button type="button" className="h-10 rounded-lg border px-3 text-sm" onClick={()=>{setMatForm({id:"",code:"",description:"",category:"Geral",unit:"un",barcode:"",min_stock:"0",status:"ativo",tracks_lot:false,attributes:"{}"});setAttributeValues({});}}>Cancelar</button>}</div></form>:<Empty>O perfil atual não possui permissão para cadastrar ou editar materiais.</Empty>}
    </Panel>
    <Panel title="Materiais e saldos" description="Pesquise por código, descrição, categoria ou código de barras.">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="min-w-0"><div className="flex gap-2"><Search className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground"/><input className="h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm" placeholder="Código, descrição ou barras..." value={search} onChange={e=>setSearch(e.target.value)}/></div><p className="mt-1 text-[11px] text-muted-foreground">Compatível com leitor físico configurado como teclado.</p></div>
        <SelectField label="Situação" value={materialFilters.status} onChange={value=>setMaterialFilters(current=>({...current,status:value}))} options={[{value:"todos",label:"Todas as situações"},{value:"ativo",label:"Ativos"},{value:"inativo",label:"Inativos"}]}/>
        <SelectField label="Nível de estoque" value={materialFilters.stock} onChange={value=>setMaterialFilters(current=>({...current,stock:value}))} options={[{value:"todos",label:"Todos os níveis"},{value:"baixo",label:"Abaixo do mínimo"},{value:"normal",label:"No mínimo ou acima"}]}/>
      </div>
      <Table headers={["Código","Descrição","Categoria","Unidade","Saldo total","Mínimo","Situação","Ações"]} rows={filtered(materials,["code","description","category","barcode"]).filter(m=>(materialFilters.status==="todos"||m.status===materialFilters.status)&&(materialFilters.stock==="todos"||(materialFilters.stock==="baixo"?balances.filter(b=>b.material_id===m.id).reduce((sum,b)=>sum+Number(b.quantity||0),0)<Number(m.min_stock||0):balances.filter(b=>b.material_id===m.id).reduce((sum,b)=>sum+Number(b.quantity||0),0)>=Number(m.min_stock||0)))).map(m=>{const qty=balances.filter(b=>b.material_id===m.id).reduce((s,b)=>s+Number(b.quantity||0),0);return [m.code,m.description,m.category,m.unit,qty,m.min_stock,qty<Number(m.min_stock||0)?<span className="font-semibold text-amber-700">Abaixo do mínimo</span>:statusPill(m.status),<div className="flex gap-2">{canManage&&<button className="rounded border p-2" title="Editar" onClick={()=>{setMatForm({id:m.id,code:m.code,description:m.description,category:m.category,unit:m.unit,barcode:m.barcode??"",min_stock:String(m.min_stock),status:m.status,tracks_lot:m.tracks_lot,attributes:JSON.stringify(m.attributes??{},null,2)});setAttributeValues(Object.fromEntries(Object.entries(m.attributes??{}).map(([key,value])=>[key,String(value??"")])));}}><Pencil className="h-4 w-4"/></button>}{canManage&&<button className="rounded border p-2" title="Alternar status" onClick={()=>void runSave(async()=>{const {error}=await db.from("materials").update({status:m.status==="ativo"?"inativo":"ativo",updated_at:new Date().toISOString()}).eq("id",m.id).eq("org_id",orgId);if(error)throw error;},"Status atualizado.")}>{m.status==="ativo"?<Ban className="h-4 w-4"/>:<Check className="h-4 w-4"/>}</button>}</div>]})}/>
    </Panel>
    <Panel title="Saldo por endereço" description="Lote e validade são exibidos quando registrados."><Table headers={["Material","Endereço","Lote","Quantidade","Unidade","Validade"]} rows={balances.filter(b=>Number(b.quantity)!==0).map(b=>[pretty(materials.find(m=>m.id===b.material_id)?.code),pretty(locations.find(l=>l.id===b.location_id)?.code),pretty(b.lot),b.quantity,pretty(materials.find(m=>m.id===b.material_id)?.unit),dateLabel(b.expiry_date)])}/></Panel>
  </div>;

  const movementsSection = <div className="space-y-5">
    <Panel title="Registrar movimentação" description="Entrada, saída e transferência usam a função transacional do banco. Ajustes de inventário exigem contagem física e justificativa.">
      {canOperate?<form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const qty=Number(moveForm.quantity);if(!moveForm.material_id)throw new Error("Selecione um material.");if(!Number.isFinite(qty)||qty<=0)throw new Error("A quantidade precisa ser maior que zero.");if(moveForm.type==="entrada"&&!moveForm.to_location_id)throw new Error("Selecione o endereço de destino.");if(moveForm.type==="saida"&&!moveForm.from_location_id)throw new Error("Selecione o endereço de origem.");if(moveForm.type==="transferencia"&&(!moveForm.from_location_id||!moveForm.to_location_id||moveForm.from_location_id===moveForm.to_location_id))throw new Error("Transferência exige origem e destino diferentes.");if(moveForm.type==="ajuste"){throw new Error("Use a ação de ajuste físico no formulário de inventário abaixo.");}const {error}=await db.rpc("register_movement",{_type:moveForm.type,_material:moveForm.material_id,_qty:qty,_org:orgId,_from:moveForm.from_location_id||null,_to:moveForm.to_location_id||null,_lot:moveForm.lot||"",_reference:moveForm.reference||"",_notes:[moveForm.reason,moveForm.notes].filter(Boolean).join(" — "),_request:crypto.randomUUID()});if(error)throw error;setMoveForm({...moveForm,quantity:"1",lot:"",reference:"",reason:"",notes:""});},"Movimentação registrada.");}}><SelectField label="Tipo" value={moveForm.type} onChange={v=>setMoveForm({...moveForm,type:v})} options={movementTypes.filter(v=>v!=="ajuste").map(v=>({value:v,label:v.replaceAll("_"," ")}))} required/><SelectField label="Material" value={moveForm.material_id} onChange={v=>setMoveForm({...moveForm,material_id:v})} options={materials.filter(m=>m.status==="ativo"||m.status==="active").map(m=>({value:m.id,label:`${m.code} — ${m.description}`}))} required/><Field label="Quantidade" type="number" min={0.01} step={0.01} value={moveForm.quantity} onChange={v=>setMoveForm({...moveForm,quantity:v})} required/><SelectField label="Origem" value={moveForm.from_location_id} onChange={v=>setMoveForm({...moveForm,from_location_id:v})} options={locations.filter(l=>l.active&&l.status!=="bloqueado").map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><SelectField label="Destino" value={moveForm.to_location_id} onChange={v=>setMoveForm({...moveForm,to_location_id:v})} options={locations.filter(l=>l.active&&l.status!=="bloqueado").map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><Field label="Lote (quando aplicável)" value={moveForm.lot} onChange={v=>setMoveForm({...moveForm,lot:v})}/><Field label="Referência documental" value={moveForm.reference} onChange={v=>setMoveForm({...moveForm,reference:v})}/><Field label="Motivo" value={moveForm.reason} onChange={v=>setMoveForm({...moveForm,reason:v})}/><Field label="Observações" value={moveForm.notes} onChange={v=>setMoveForm({...moveForm,notes:v})}/><div className="flex items-end"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Confirmar movimentação</button></div></form>:<Empty>O perfil atual não possui permissão para registrar movimentações.</Empty>}
    </Panel>
    <Panel title="Ajuste de inventário" description="Registra a contagem física e diferença por meio da rotina de ajuste do banco.">
      {canOperate?<AdjustmentForm orgId={orgId} materials={materials} locations={locations} saving={saving} onSave={runSave} onDone={refresh}/>:<Empty>O perfil atual não possui permissão para ajustar estoque.</Empty>}
    </Panel>
    <Panel title="Histórico de movimentações" description="Registros concluídos são preservados; correções devem usar estorno rastreável.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="flex gap-2"><Search className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground"/><input className="h-10 w-full rounded-lg border bg-background px-3 text-sm" placeholder="Pesquisar referência, lote, material..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <SelectField label="Tipo" value={movementFilters.type} onChange={value=>setMovementFilters(current=>({...current,type:value}))} options={[{value:"todos",label:"Todos os tipos"},...["entrada","saida","transferencia","ajuste","estorno"].map(value=>({value,label:value}))]}/>
        <SelectField label="Material" value={movementFilters.material_id} onChange={value=>setMovementFilters(current=>({...current,material_id:value}))} options={[{value:"todos",label:"Todos os materiais"},...materials.map(material=>({value:material.id,label:`${material.code} — ${material.description}`}))]}/>
        <SelectField label="Endereço" value={movementFilters.location_id} onChange={value=>setMovementFilters(current=>({...current,location_id:value}))} options={[{value:"todos",label:"Todos os endereços"},...locations.map(location=>({value:location.id,label:`${location.code} — ${location.name}`}))]}/>
        <SelectField label="Responsável" value={movementFilters.user_id} onChange={value=>setMovementFilters(current=>({...current,user_id:value}))} options={[{value:"todos",label:"Todos os usuários"},...members.map(member=>({value:member.user_id,label:member.profiles?.full_name||member.profiles?.email||member.user_id.slice(0,8)}))]}/>
        <Field label="Data inicial" type="date" value={movementFilters.fromDate} onChange={value=>setMovementFilters(current=>({...current,fromDate:value}))}/>
        <Field label="Data final" type="date" value={movementFilters.toDate} onChange={value=>setMovementFilters(current=>({...current,toDate:value}))}/>
      </div>
      <Table headers={["Nº","Data","Tipo","Material","Quantidade","Origem","Destino","Referência / motivo","Estorno"]} rows={movements.filter(m=>{const material=materials.find(item=>item.id===m.material_id);const fromLocation=locations.find(item=>item.id===m.from_location_id);const toLocation=locations.find(item=>item.id===m.to_location_id);const query=search.trim().toLowerCase();const createdAt=new Date(m.created_at).getTime();const fromDate=movementFilters.fromDate?new Date(`${movementFilters.fromDate}T00:00:00`).getTime():null;const toDate=movementFilters.toDate?new Date(`${movementFilters.toDate}T23:59:59.999`).getTime():null;const searchable=[m.number,m.type,m.lot,m.reason,m.reference,m.notes,material?.code,material?.description,fromLocation?.code,fromLocation?.name,toLocation?.code,toLocation?.name,members.find(member=>member.user_id===m.user_id)?.profiles?.email];return (!query||searchable.some(value=>String(value??"").toLowerCase().includes(query)) )&&(movementFilters.type==="todos"||m.type===movementFilters.type)&&(movementFilters.material_id==="todos"||m.material_id===movementFilters.material_id)&&(movementFilters.location_id==="todos"||m.from_location_id===movementFilters.location_id||m.to_location_id===movementFilters.location_id)&&(movementFilters.user_id==="todos"||m.user_id===movementFilters.user_id)&&(!fromDate||createdAt>=fromDate)&&(!toDate||createdAt<=toDate);}).map(m=>[pretty(m.number),new Date(m.created_at).toLocaleString("pt-BR"),statusPill(m.type),pretty(materials.find(x=>x.id===m.material_id)?.code),`${pretty(m.quantity)} ${materials.find(x=>x.id===m.material_id)?.unit??""}`,pretty(locations.find(x=>x.id===m.from_location_id)?.code),pretty(locations.find(x=>x.id===m.to_location_id)?.code),pretty(m.reference||m.reason),m.reversed_by?"Estornado":canOperate?<button className="rounded border px-2 py-1 text-xs" onClick={()=>{const reason=window.prompt("Motivo do estorno (obrigatório):");if(reason?.trim())void runSave(async()=>{const {error}=await db.rpc("reverse_movement",{_movement:m.id,_reason:reason.trim()});if(error)throw error;},"Estorno registrado.");}}>Estornar</button>:"—"])}/></Panel>
    <Panel title="Contagens de inventário" description="Histórico de diferenças registradas."><Table headers={["Data","Material","Endereço","Lote","Esperado","Contado","Diferença","Motivo"]} rows={counts.map(c=>[dateLabel(c.created_at),pretty(materials.find(m=>m.id===c.material_id)?.code),pretty(locations.find(l=>l.id===c.location_id)?.code),pretty(c.lot),c.expected_qty,c.counted_qty,c.difference,pretty(c.reason)])}/></Panel>
  </div>;


  const selectedInventory = inventorySessions.find((session) => session.id === selectedInventoryId);
  const selectedInventoryItems = counts.filter((item) => item.count_id === selectedInventoryId);

  const inventorySection = <div className="space-y-5">
    <Panel title="Abrir inventário" description="Crie uma sessão de contagem para organizar as conferências. As diferenças são registradas com histórico e motivo.">
      {canOperate?<form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={e=>{e.preventDefault();void runSave(async()=>{
        const payload={org_id:orgId,warehouse_id:inventoryForm.warehouse_id&&inventoryForm.warehouse_id!=="todos"?inventoryForm.warehouse_id:null,description:inventoryForm.description.trim()||"Contagem cíclica",created_by:user!.id,status:"em_andamento",completed_at:null};
        const {data,error}=await db.from("inventory_counts").insert(payload).select("*").single();
        if(error)throw error;
        setInventoryForm({warehouse_id:"todos",description:""});
        setSelectedInventoryId(data.id);
      },"Sessão de inventário criada.");}}>
        <Field label="Descrição" value={inventoryForm.description} onChange={v=>setInventoryForm({...inventoryForm,description:v})} placeholder="Ex.: Contagem cíclica semanal"/>
        <SelectField label="Armazém (opcional)" value={inventoryForm.warehouse_id} onChange={v=>setInventoryForm({...inventoryForm,warehouse_id:v})} options={[{value:"todos",label:"Todos os armazéns"},...warehouses.filter(w=>w.active).map(w=>({value:w.id,label:w.name}))]}/>
        <div className="flex items-end"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="mr-2 inline h-4 w-4"/>Iniciar inventário</button></div>
      </form>:<Empty>O perfil atual não possui permissão para abrir inventários.</Empty>}
    </Panel>

    <Panel title="Sessões de inventário" description="Selecione uma sessão em andamento para lançar contagens. Uma combinação de material, endereço e lote só pode ser contada uma vez por sessão.">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Sessão selecionada" value={selectedInventoryId} onChange={setSelectedInventoryId} options={inventorySessions.map(session=>({value:session.id,label:`${new Date(session.created_at).toLocaleDateString("pt-BR")} · ${session.description||"Inventário"} · ${session.status==="concluido"?"Concluído":"Em andamento"}`}))}/>
        {selectedInventory&&<div className="rounded-lg border bg-muted/30 p-3 text-sm"><p className="font-semibold">{selectedInventory.description||"Inventário"}</p><p className="mt-1 text-muted-foreground">{warehouses.find(w=>w.id===selectedInventory.warehouse_id)?.name??"Todos os armazéns"} · {selectedInventory.status==="concluido"?"Concluído":"Em andamento"}</p><p className="mt-1 text-xs text-muted-foreground">{selectedInventoryItems.length} contagem(ns) · {selectedInventoryItems.filter(item=>Number(item.difference)!==0).length} divergência(s)</p></div>}
      </div>
      {!inventorySessions.length?<Empty>Nenhum inventário registrado. Crie uma sessão acima para começar.</Empty>:null}
      {selectedInventory&&selectedInventory.status==="em_andamento"&&canOperate&&<div className="mt-4 border-t pt-4"><h3 className="mb-3 text-sm font-semibold">Registrar contagem física</h3><AdjustmentForm countId={selectedInventory.id} warehouseId={selectedInventory.warehouse_id} orgId={orgId} materials={materials} locations={locations} saving={saving} onSave={runSave} onDone={refresh}/></div>}
      {selectedInventory&&selectedInventory.status==="concluido"&&<p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">Esta sessão foi concluída e não aceita novas contagens.</p>}
      {selectedInventory&&selectedInventory.status==="em_andamento"&&canOperate&&(canManage||selectedInventory.created_by===user?.id)&&<div className="mt-4 flex justify-end"><button type="button" disabled={saving} onClick={()=>void runSave(async()=>{const {data,error}=await db.from("inventory_counts").update({status:"concluido",completed_at:new Date().toISOString()}).eq("id",selectedInventory.id).eq("org_id",orgId).eq("status","em_andamento").select("id").single();if(error||!data)throw error??new Error("Não foi possível concluir o inventário.");},"Inventário concluído. O histórico foi preservado.")} className="rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"><Check className="mr-2 inline h-4 w-4"/>Concluir inventário</button></div>}
    </Panel>

    {selectedInventory&&<Panel title="Contagens registradas" description="O saldo esperado, a quantidade contada e a diferença ficam vinculados à sessão.">
      <Table headers={["Material","Endereço","Lote","Esperado","Contado","Diferença","Motivo","Data"]} rows={selectedInventoryItems.map(item=>[pretty(materials.find(m=>m.id===item.material_id)?.code),pretty(locations.find(l=>l.id===item.location_id)?.code),pretty(item.lot),item.expected_qty,item.counted_qty,<span className={Number(item.difference)===0?"text-emerald-700":"font-semibold text-amber-700"}>{item.difference}</span>,pretty(item.reason),new Date(item.created_at).toLocaleString("pt-BR")])}/>
    </Panel>}

    <Panel title="Histórico de sessões" description="Inventários concluídos e em andamento, com total de contagens e divergências.">
      <Table headers={["Data","Descrição","Armazém","Status","Contagens","Divergências"]} rows={inventorySessions.map(session=>{const items=counts.filter(item=>item.count_id===session.id);return [new Date(session.created_at).toLocaleString("pt-BR"),pretty(session.description),warehouses.find(w=>w.id===session.warehouse_id)?.name??"Todos os armazéns",statusPill(session.status),items.length,items.filter(item=>Number(item.difference)!==0).length];})}/>
    </Panel>
  </div>;

  const taskStatusMeta: Record<string, { label: string; description: string; column: string; dot: string; count: string }> = {
    a_fazer: {
      label: "A fazer",
      description: "Atividades aguardando início",
      column: "border-slate-200 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-900/50",
      dot: "bg-slate-400",
      count: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    },
    em_andamento: {
      label: "Em andamento",
      description: "Atividades em execução",
      column: "border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/25",
      dot: "bg-blue-500",
      count: "bg-blue-100 text-blue-900 dark:bg-blue-900/60 dark:text-blue-100",
    },
    aguardando: {
      label: "Aguardando",
      description: "Dependências ou conferências pendentes",
      column: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/25",
      dot: "bg-amber-500",
      count: "bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100",
    },
    concluida: {
      label: "Concluída",
      description: "Atividades finalizadas",
      column: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/25",
      dot: "bg-emerald-500",
      count: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100",
    },
  };
  const taskPriorityMeta: Record<string, { label: string; className: string; stripe: string }> = {
    baixa: { label: "Baixa", className: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200", stripe: "border-l-slate-300 dark:border-l-slate-600" },
    media: { label: "Média", className: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200", stripe: "border-l-sky-400" },
    alta: { label: "Alta", className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200", stripe: "border-l-amber-500" },
    urgente: { label: "Urgente", className: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200", stripe: "border-l-red-500" },
  };
  const updateTaskStatus = (taskId: string, nextStatus: string) => {
    const currentTask = tasks.find((task) => task.id === taskId);
    if (!canOperate || saving || !currentTask || currentTask.status === nextStatus) return;
    void runSave(async () => {
      const now = new Date().toISOString();
      const { error, data } = await db.from("tasks")
        .update({
          status: nextStatus,
          updated_at: now,
          completed_at: nextStatus === "concluida" ? (currentTask.completed_at ?? now) : null,
        })
        .eq("id", taskId)
        .eq("org_id", orgId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Tarefa não encontrada ou sem permissão para alterar o status.");
    }, "Status da tarefa atualizado.");
  };
  const taskLocationLabel = (locationId: string | null | undefined) => {
    if (!locationId) return "Endereço não vinculado";
    const location = locations.find((item) => item.id === locationId);
    if (!location) return "Endereço indisponível";
    const warehouse = warehouses.find((item) => item.id === location.warehouse_id);
    return [warehouse?.code, location.code, location.name].filter(Boolean).join(" · ");
  };
  const taskMaterialLabel = (materialId: string | null | undefined) => {
    if (!materialId) return "Material não vinculado";
    const material = materials.find((item) => item.id === materialId);
    return material ? `${material.code} · ${material.description}` : "Material indisponível";
  };
  const taskAssigneeLabel = (assigneeId: string | null | undefined) => {
    if (!assigneeId) return "Sem responsável";
    const member = members.find((item) => item.user_id === assigneeId);
    return member?.profiles?.full_name || member?.profiles?.email || `Membro ${assigneeId.slice(0, 8)}`;
  };
  const filteredKanbanTasks = filtered(tasks, ["title", "description", "type", "priority"]);

  const tasksSection = <div className="space-y-5">
    <Panel title={taskForm.id?"Editar tarefa":"Criar tarefa operacional"} description="Alterar o status da tarefa não movimenta estoque. A operação física deve ser registrada no módulo Movimentações.">
      {canOperate?<form className="grid gap-3 rounded-xl border bg-muted/20 p-3 shadow-sm sm:grid-cols-2 sm:p-4 xl:grid-cols-3" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const p={org_id:orgId,title:taskForm.title.trim(),description:taskForm.description.trim()||null,type:taskForm.type,priority:taskForm.priority,status:taskForm.status,assignee_id:taskForm.assignee_id||null,due_at:taskForm.due_at?new Date(taskForm.due_at).toISOString():null,material_id:taskForm.material_id||null,location_id:taskForm.location_id||null,updated_at:new Date().toISOString(),completed_at:taskForm.status==="concluida"?new Date().toISOString():null,...(!taskForm.id?{created_by:user?.id}:{})};const q=taskForm.id?db.from("tasks").update(p).eq("id",taskForm.id):db.from("tasks").insert(p);const {error}=await q;if(error)throw error;setTaskForm({id:"",title:"",description:"",type:"recebimento",priority:"media",status:"a_fazer",assignee_id:"",due_at:"",material_id:"",location_id:""});},"Tarefa salva.");}}><div className="border-b pb-2 sm:col-span-2 xl:col-span-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalhes da atividade</p><p className="mt-0.5 text-[11px] text-muted-foreground">Identifique a operação e defina sua prioridade, etapa e prazo.</p></div><Field label="Título" value={taskForm.title} onChange={v=>setTaskForm({...taskForm,title:v})} required/><SelectField label="Tipo de tarefa" value={taskForm.type} onChange={v=>setTaskForm({...taskForm,type:v})} options={taskTypes.map(v=>({value:v,label:v.replaceAll("_"," ")}))} required/><SelectField label="Prioridade" value={taskForm.priority} onChange={v=>setTaskForm({...taskForm,priority:v})} options={priorities.map(v=>({value:v,label:v}))} required/><SelectField label="Status" value={taskForm.status} onChange={v=>setTaskForm({...taskForm,status:v})} options={taskStatuses.map(v=>({value:v,label:v.replaceAll("_"," ")}))} required/><Field label="Prazo" type="datetime-local" value={taskForm.due_at} onChange={v=>setTaskForm({...taskForm,due_at:v})}/><SelectField label="Responsável (membro)" value={taskForm.assignee_id} onChange={v=>setTaskForm({...taskForm,assignee_id:v})} options={members.map(m=>({value:m.user_id,label:m.profiles?.full_name||m.profiles?.email||m.user_id.slice(0,8)}))}/><div className="border-t pt-3 sm:col-span-2 xl:col-span-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vínculos operacionais</p><p className="mt-0.5 text-[11px] text-muted-foreground">Associe a tarefa a um material e endereço para exibir esses dados no Kanban e no mapa.</p></div><SelectField label="Material relacionado" value={taskForm.material_id} onChange={v=>setTaskForm({...taskForm,material_id:v})} options={materials.map(m=>({value:m.id,label:`${m.code} — ${m.description}`}))}/><SelectField label="Endereço relacionado" value={taskForm.location_id} onChange={v=>setTaskForm({...taskForm,location_id:v})} options={locations.map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><label className="grid gap-1.5 text-sm sm:col-span-2 xl:col-span-3"><span className="font-medium">Descrição</span><textarea className="min-h-20 rounded-lg border bg-background p-3" value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})}/></label><div className="flex items-end gap-2"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">{taskForm.id?"Salvar alterações":"Criar tarefa"}</button>{taskForm.id&&<button type="button" className="h-10 rounded-lg border px-3 text-sm" onClick={()=>setTaskForm({id:"",title:"",description:"",type:"recebimento",priority:"media",status:"a_fazer",assignee_id:"",due_at:"",material_id:"",location_id:""})}>Cancelar</button>}</div></form>:<Empty>O perfil atual não possui permissão para criar ou atualizar tarefas.</Empty>}
    </Panel>
    <Panel title="Quadro Kanban" description="Acompanhe atividades por etapa. Arraste um cartão para outra coluna para atualizar o status; no celular, use o seletor do próprio cartão.">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            className="h-10 w-full max-w-sm min-w-0 rounded-lg border bg-background px-3 text-sm"
            placeholder="Pesquisar tarefas, materiais ou endereços..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">Dica: arraste o cartão no computador; no celular, segure a alça ou use o seletor de etapa.</p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {taskStatuses.map((status) => {
          const meta = taskStatusMeta[status] ?? taskStatusMeta.a_fazer!;
          const laneTasks = filteredKanbanTasks.filter((task) => task.status === status);
          const isDropTarget = dragOverTaskStatus === status;
          return (
            <section
              key={status}
              data-kanban-status={status}
              className={
                "min-w-0 rounded-2xl border-2 p-3 transition-all " +
                meta.column +
                (isDropTarget ? " ring-2 ring-primary ring-offset-2 border-primary" : "")
              }
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + meta.dot} />
                    <h3 className="break-words text-sm font-bold">{meta.label}</h3>
                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums " + meta.count}>
                      {tasks.filter((task) => task.status === status).length}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{meta.description}</p>
                </div>
                {isDropTarget && <span className="shrink-0 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">Soltar aqui</span>}
              </div>

              <div
                className="min-h-36 space-y-3 rounded-xl"
                onDragOver={(event) => {
                  if (!canOperate || saving || !draggedTaskId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverTaskStatus(status);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDragOverTaskStatus((current) => current === status ? null : current);
                  }
                }}
                onDrop={(event) => {
                  if (!canOperate || saving) return;
                  event.preventDefault();
                  const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
                  setDraggedTaskId(null);
                  setDragOverTaskStatus(null);
                  if (taskId) updateTaskStatus(taskId, status);
                }}
              >
                {laneTasks.map((task) => {
                  const overdue = Boolean(
                    task.due_at &&
                    new Date(task.due_at).getTime() < Date.now() &&
                    task.status !== "concluida"
                  );
                  const priority = taskPriorityMeta[task.priority] ?? taskPriorityMeta.media!;
                  const isDragging = draggedTaskId === task.id;
                  return (
                    <article
                      key={task.id}
                      draggable={canOperate && !saving}
                      onDragStart={(event) => {
                        if (!canOperate || saving) {
                          event.preventDefault();
                          return;
                        }
                        setDraggedTaskId(task.id);
                        event.dataTransfer.setData("text/plain", task.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggedTaskId(null);
                        setDragOverTaskStatus(null);
                      }}
                      className={
                        "min-w-0 rounded-xl border border-l-4 bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md " +
                        priority.stripe +
                        (isDragging ? " scale-[0.98] opacity-45" : "") +
                        (canOperate ? " cursor-grab active:cursor-grabbing" : "")
                      }
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        {canOperate && (
                          <button
                            type="button"
                            className="touch-none mt-0.5 h-8 w-8 shrink-0 rounded-md border bg-muted/60 p-1.5 text-muted-foreground active:bg-primary/10 active:text-primary"
                            title="Segure e arraste para outra etapa"
                            aria-label={"Arrastar tarefa " + task.title + " para outra etapa"}
                            onPointerDown={(event) => {
                              if (event.pointerType === "mouse") return;
                              event.preventDefault();
                              event.stopPropagation();
                              event.currentTarget.setPointerCapture(event.pointerId);
                              setDraggedTaskId(task.id);
                              setDragOverTaskStatus(null);
                            }}
                            onPointerMove={(event) => {
                              if (draggedTaskId !== task.id) return;
                              const targetLane = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-kanban-status]");
                              setDragOverTaskStatus(targetLane?.dataset.kanbanStatus ?? null);
                            }}
                            onPointerUp={(event) => {
                              if (draggedTaskId !== task.id) return;
                              const targetLane = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-kanban-status]");
                              const nextStatus = targetLane?.dataset.kanbanStatus;
                              setDraggedTaskId(null);
                              setDragOverTaskStatus(null);
                              if (nextStatus) updateTaskStatus(task.id, nextStatus);
                            }}
                            onPointerCancel={() => {
                              setDraggedTaskId(null);
                              setDragOverTaskStatus(null);
                            }}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="break-words text-sm font-semibold leading-snug">{task.title}</h4>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-full border bg-muted/60 px-2 py-0.5 text-[10px] font-medium capitalize">
                              {task.type.replaceAll("_", " ")}
                            </span>
                            <span className={"rounded-full border px-2 py-0.5 text-[10px] font-semibold " + priority.className}>
                              {priority.label}
                            </span>
                          </div>
                        </div>
                        {(task.priority === "urgente" || task.priority === "alta") && (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        )}
                      </div>

                      {task.description && (
                        <p className="mt-3 line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground">
                          {task.description}
                        </p>
                      )}

                      <div className="mt-3 grid min-w-0 gap-2">
                        <div className="flex min-w-0 items-start gap-2 rounded-lg bg-muted/45 px-2.5 py-2">
                          <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Material</p>
                            <p className="break-words text-xs font-medium [overflow-wrap:anywhere]">{taskMaterialLabel(task.material_id)}</p>
                          </div>
                        </div>
                        <div className="flex min-w-0 items-start gap-2 rounded-lg bg-muted/45 px-2.5 py-2">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Endereço</p>
                            <p className="break-words text-xs font-medium [overflow-wrap:anywhere]">{taskLocationLabel(task.location_id)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span className="break-words">{taskAssigneeLabel(task.assignee_id)}</span>
                        </div>
                        <div className={"flex items-center gap-1 text-[11px] " + (overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                          <span>{task.due_at ? dateLabel(task.due_at) : "Sem prazo"}{overdue ? " · atrasada" : ""}</span>
                        </div>
                      </div>

                      {canOperate && (
                        <div className="mt-3 flex min-w-0 items-center gap-2">
                          <label className="min-w-0 flex-1">
                            <span className="sr-only">Mover tarefa para outra etapa</span>
                            <select
                              aria-label={"Mover " + task.title + " para outra etapa"}
                              className="h-9 w-full min-w-0 rounded-lg border bg-background px-2 text-xs font-medium"
                              value={task.status}
                              disabled={saving}
                              onChange={(event) => updateTaskStatus(task.id, event.target.value)}
                            >
                              {taskStatuses.map((nextStatus) => (
                                <option key={nextStatus} value={nextStatus}>
                                  Mover para: {taskStatusMeta[nextStatus]?.label ?? nextStatus}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="h-9 shrink-0 rounded-lg border bg-background p-2 hover:bg-muted"
                            title="Editar tarefa"
                            aria-label={"Editar tarefa " + task.title}
                            onClick={() => setTaskForm({
                              id: task.id,
                              title: task.title,
                              description: task.description ?? "",
                              type: task.type,
                              priority: task.priority,
                              status: task.status,
                              assignee_id: task.assignee_id ?? "",
                              due_at: task.due_at ? new Date(task.due_at).toISOString().slice(0, 16) : "",
                              material_id: task.material_id ?? "",
                              location_id: task.location_id ?? "",
                            })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}

                {laneTasks.length === 0 && (
                  <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-current/20 px-3 py-5 text-center text-xs text-muted-foreground">
                    {search.trim() ? "Nenhuma tarefa corresponde à pesquisa nesta etapa." : "Solte uma tarefa aqui ou crie uma nova atividade."}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </Panel>
  </div>;

  const exportsSection = <div className="space-y-5">
    <Panel title="Preparar exportação" description="Gera arquivos a partir dos dados consultados. Isso não sincroniza nem importa dados em um ERP.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SelectField label="Conjunto de dados" value={exportForm.dataset} onChange={v=>setExportForm({...exportForm,dataset:v,template_id:""})} options={Object.entries(datasets).map(([value,d])=>({value,label:d.label}))}/><SelectField label="Formato" value={exportForm.format} onChange={v=>setExportForm({...exportForm,format:v})} options={[{value:"csv",label:"CSV"},{value:"xlsx",label:"XLSX"},{value:"json",label:"JSON"}]}/><SelectField label="Delimitador CSV" value={exportForm.delimiter} onChange={v=>setExportForm({...exportForm,delimiter:v})} options={[{value:";",label:"Ponto e vírgula (;)"},{value:",",label:"Vírgula (,)"},{value:"|",label:"Barra vertical (|)"},{value:"\t",label:"Tabulação"}]}/><SelectField label="Formato de data" value={exportForm.date_format} onChange={v=>setExportForm({...exportForm,date_format:v})} options={[{value:"ISO",label:"ISO (AAAA-MM-DD)"},{value:"BR",label:"Brasil (DD/MM/AAAA)"}]}/><SelectField label="Modelo salvo" value={exportForm.template_id} onChange={v=>{const t=templates.find(x=>x.id===v);setExportForm({...exportForm,template_id:v,template_name:t?.name??""});setExportFieldMappings(t?.config?.mappings??{});if(t?.config?.fields)setSelectedFields(t.config.fields);if(t?.config?.delimiter)setExportForm(prev=>({...prev,template_id:v,template_name:t.name,delimiter:t.config.delimiter}));}} options={templates.filter(t=>t.dataset===exportForm.dataset).map(t=>({value:t.id,label:t.name}))}/></div>
      <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">Campos a exportar (selecione a ordem abaixo)</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{datasets[exportForm.dataset]!.fields.map(f=><label key={f} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={selectedFields.includes(f)} onChange={e=>setSelectedFields(old=>e.target.checked?[...old,f]:old.filter(x=>x!==f))}/>{f}</label>)}</div><p className="mt-2 text-xs text-muted-foreground">A ordem dos campos selecionados determina a ordem das colunas. Os modelos são personalizados, não layouts oficiais de ERP.</p></div>
      <div className="mt-4 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Mapeamento de campos para o ERP</h3>
        <p className="mt-1 text-xs text-muted-foreground">Informe o nome da coluna no arquivo de destino. Por padrão, o nome original do campo é mantido.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{selectedFields.map(field=><Field key={field} label={`Destino de: ${field}`} value={exportFieldMappings[field]??field} onChange={value=>setExportFieldMappings(current=>({...current,[field]:value}))} required/>)}</div>
      </div>
      {canManage&&<div className="mt-4 flex flex-wrap items-end gap-3"><div className="w-full max-w-sm"><Field label="Nome do modelo para salvar" value={exportForm.template_name} onChange={v=>setExportForm({...exportForm,template_name:v})} placeholder="Ex.: Modelo ERP interno"/></div><button className="h-10 rounded-lg border px-4 text-sm font-medium" disabled={!exportForm.template_name.trim()||selectedFields.length===0||saving} onClick={()=>void runSave(async()=>{const payload={org_id:orgId,name:exportForm.template_name.trim(),dataset:exportForm.dataset,created_by:user?.id,config:{fields:selectedFields,mappings:exportFieldMappings,delimiter:exportForm.delimiter,date_format:exportForm.date_format,format:exportForm.format},updated_at:new Date().toISOString()};const {error}=await db.from("export_templates").insert(payload);if(error)throw error;setExportForm({...exportForm,template_name:""});},"Modelo de exportação salvo.")}>Salvar modelo</button></div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label={exportForm.dataset==="balances"?"Atualizado a partir de":"Criado a partir de"} type="date" value={exportFromDate} onChange={setExportFromDate}/><Field label={exportForm.dataset==="balances"?"Atualizado até":"Criado até"} type="date" value={exportToDate} onChange={setExportToDate}/><div className="sm:col-span-2"><Field label="Filtro textual da prévia" value={search} onChange={setSearch} placeholder="Filtrar registros carregados"/></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><button className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={loading||selectedFields.length===0} onClick={async()=>{setDataError("");try{const d=datasets[exportForm.dataset]!;if(exportFromDate&&exportToDate&&exportFromDate>exportToDate)throw new Error("A data inicial não pode ser posterior à data final.");const targetFields=selectedFields.map(field=>(exportFieldMappings[field]??"").trim()||field);if(new Set(targetFields.map(field=>field.toLowerCase())).size!==targetFields.length)throw new Error("Os nomes de destino precisam ser únicos.");const dateColumn=exportForm.dataset==="balances"?"updated_at":"created_at";const dateFrom=exportFromDate?new Date(`${exportFromDate}T00:00:00`).toISOString():null;const dateTo=exportToDate?new Date(`${exportToDate}T23:59:59.999`).toISOString():null;const sourceRows:AnyRow[]=[];for(let offset=0;offset<5000;offset+=1000){let request=db.from(d.table).select("*").eq("org_id",orgId);if(dateFrom)request=request.gte(dateColumn,dateFrom);if(dateTo)request=request.lte(dateColumn,dateTo);const {data,error}=await request.order(dateColumn,{ascending:true}).range(offset,Math.min(offset+999,4999));if(error)throw error;const pageRows=data??[];sourceRows.push(...pageRows);if(pageRows.length<1000)break;}const rows=sourceRows.map((row:AnyRow)=>Object.fromEntries(selectedFields.map((field,index)=>[targetFields[index],row[field]??""])));const query=search.trim().toLowerCase();const filteredRows=query?rows.filter((row:AnyRow)=>Object.values(row).some(v=>String(v??"").toLowerCase().includes(query))):rows;const missing=filteredRows.reduce((total:number,row:AnyRow)=>total+Object.values(row).filter(value=>value==null||String(value).trim()==="").length,0);const requiredFields=(mandatoryExportFields[exportForm.dataset]??[]).filter(field=>selectedFields.includes(field));const missingRequired=filteredRows.reduce((total:number,row:AnyRow)=>total+requiredFields.filter(field=>{const mappedField=targetFields[selectedFields.indexOf(field)];const value=row[mappedField];return value==null||String(value).trim()==="";}).length,0);setExportMissingValues(missing);setExportMissingRequired(missingRequired);setPreview(filteredRows);notify(`Prévia carregada: ${filteredRows.length} registro(s); ${missingRequired} campo(s) obrigatório(s) vazio(s). Limite consultado: 5.000 registros.`);}catch(e){fail(e);}}}><Search className="h-4 w-4"/> Pré-visualizar</button><button className="flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold" disabled={preview.length===0||!orgId} onClick={()=>void runSave(async()=>{if(!preview.length)throw new Error("Gere uma prévia com ao menos um registro antes de exportar.");if(exportForm.format==="csv"&&(!exportForm.delimiter||exportForm.delimiter.length!==1))throw new Error("Escolha um delimitador CSV de um único caractere.");const safeName=datasets[exportForm.dataset]!.label.toLowerCase().replace(/[^a-z0-9]+/g,"-");const output=buildExportBlob(exportForm.format,preview,exportForm.delimiter,exportForm.date_format);if(user&&orgId){const {error}=await db.from("export_history").insert({org_id:orgId,user_id:user.id,dataset:exportForm.dataset,format:exportForm.format,record_count:preview.length,filters:{fields:selectedFields,mappings:exportFieldMappings,delimiter:exportForm.delimiter,date_format:exportForm.date_format,from:exportFromDate,to:exportToDate},template_id:exportForm.template_id||null,template_name:exportForm.template_name||null});if(error)throw error;}downloadBlob(output.blob,`armaZen-${safeName}.${output.extension}`);},"Arquivo gerado. A geração não significa que o ERP recebeu ou importou os dados.")}><Download className="h-4 w-4"/> Gerar arquivo</button><span className="text-sm text-muted-foreground">{preview.length} registro(s) na prévia</span></div>
      {preview.length>0&&<div className="mt-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">Exibindo até 10 linhas da prévia; limite de 5.000 registros carregados.</span><div className="flex flex-wrap gap-3"><span className={exportMissingValues?"font-medium text-amber-700":"text-emerald-700"}>{exportMissingValues} campo(s) vazio(s) na seleção</span><span className={exportMissingRequired?"font-medium text-destructive":"text-emerald-700"}>{exportMissingRequired} obrigatório(s) vazio(s)</span></div></div><Table headers={Object.keys(preview[0]??{})} rows={preview.slice(0,10).map(row=>Object.keys(preview[0]??{}).map(field=>pretty(row[field])))}/></div>}
    </Panel>
    <Panel title="Histórico de exportações" description="Auditoria das gerações de arquivo registradas no banco."><Table headers={["Data","Conjunto","Formato","Registros","Modelo","Usuário"]} rows={history.map(h=>[new Date(h.created_at).toLocaleString("pt-BR"),datasets[h.dataset]?.label??h.dataset,h.format,h.record_count,pretty(h.template_name),pretty(h.user_id)])}/></Panel>
  </div>;

  const settingsSection = <div className="space-y-5">
    <Panel title="Organização e permissões" description="Papéis: consulta, operação e gestão. A autorização real deve ser garantida também por RLS e funções do PostgreSQL.">
      <div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Organização atual</p><p className="mt-1 font-semibold">{orgName||"Não identificada"}</p></div><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Seu perfil</p><p className="mt-1 font-semibold capitalize">{role||"Não identificado"}</p></div><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Usuário autenticado</p><p className="mt-1 truncate font-semibold">{user?.email||"Sessão não identificada"}</p></div></div>
      {canManage&&!isDemoWorkspace&&<form className="mb-5 grid gap-3 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const {error}=await db.rpc("add_member_by_email",{_email:memberForm.email.trim(),_org:orgId,_role:memberForm.role});if(error)throw error;setMemberForm({email:"",role:"operacao"});},"Solicitação de associação concluída.");}}><Field label="E-mail do usuário existente" value={memberForm.email} onChange={v=>setMemberForm({...memberForm,email:v})} required/><SelectField label="Papel" value={memberForm.role} onChange={v=>setMemberForm({...memberForm,role:v})} options={[{value:"consulta",label:"Consulta"},{value:"operacao",label:"Operação"},{value:"gestao",label:"Gestão"}]} required/><div className="flex items-end"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Users className="mr-2 inline h-4 w-4"/>Associar usuário</button></div></form>}
      {canManage&&isDemoWorkspace&&<p className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">Este ambiente é uma demonstração pública. A equipe é fixa nos três perfis pré-configurados; contas externas não podem ser associadas.</p>}
      {!canManage&&<p className="mb-4 text-sm text-muted-foreground">A associação de usuários está disponível apenas para o perfil Gestão.</p>}
      <Table headers={["Nome","E-mail","Papel","Desde","Ações"]} rows={members.map(m=>[pretty(m.profiles?.full_name),pretty(m.profiles?.email),statusPill(m.role),dateLabel(m.created_at),m.user_id===user?.id?"Sessão atual":reservedDemoEmails.has(String(m.profiles?.email??"").toLowerCase())?<span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Perfil de demonstração · fixo</span>:<div className="flex flex-wrap items-center gap-2"><select aria-label={`Papel de ${m.profiles?.email??m.user_id}`} className="h-9 max-w-32 rounded-md border bg-background px-2 text-xs" value={m.role} onChange={event=>{const nextRole=event.target.value;if(nextRole===m.role)return;if(!window.confirm(`Alterar o perfil deste membro para ${nextRole}?`))return;void runSave(async()=>{const {error}=await db.rpc("set_member_role",{_member:m.id,_role:nextRole});if(error)throw error;},"Perfil do membro atualizado.");}}><option value="consulta">Consulta</option><option value="operacao">Operação</option><option value="gestao">Gestão</option></select><button type="button" title="Remover membro" className="rounded-md border px-2 py-2 text-xs hover:bg-destructive/5" onClick={()=>{if(!window.confirm(`Remover ${m.profiles?.email??"este membro"} da organização?`))return;void runSave(async()=>{const {error}=await db.rpc("remove_member",{_member:m.id});if(error)throw error;},"Membro removido.");}}><Ban className="h-3.5 w-3.5"/></button></div>])}/>
    </Panel>
    <Panel title="Campos adicionais de materiais" description="Configure informações que aparecem no cadastro de materiais sem exigir edição do código.">
      <form className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault();void runSave(async()=>{
        const key=attributeForm.key.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
        if(!/^[a-z][a-z0-9_]{0,39}$/.test(key))throw new Error("Use uma chave iniciada por letra, com letras minúsculas, números ou sublinhados.");
        if(!attributeForm.label.trim())throw new Error("Informe o nome do campo.");
        if(attributeForm.id){
          const {error}=await db.from("material_attributes").update({label:attributeForm.label.trim(),data_type:attributeForm.data_type,required:attributeForm.required}).eq("id",attributeForm.id).eq("org_id",orgId);
          if(error)throw error;
        }else{
          const {error}=await db.from("material_attributes").insert({org_id:orgId,key,label:attributeForm.label.trim(),data_type:attributeForm.data_type,required:attributeForm.required});
          if(error)throw error;
        }
        setAttributeForm({id:"",key:"",label:"",data_type:"text",required:false});
      },attributeForm.id?"Campo configurável atualizado.":"Campo configurável criado.");}}>
        {attributeForm.id?<div className="grid gap-1.5 text-sm"><span className="font-medium">Chave técnica</span><p className="rounded-lg border bg-muted/30 px-3 py-2.5 font-mono text-xs">{attributeForm.key} · chave preservada para manter os dados existentes</p></div>:<Field label="Chave técnica" value={attributeForm.key} onChange={value=>setAttributeForm({...attributeForm,key:value})} required placeholder="Ex.: fabricante"/>}
        <Field label="Nome exibido" value={attributeForm.label} onChange={value=>setAttributeForm({...attributeForm,label:value})} required placeholder="Ex.: Fabricante"/>
        <SelectField label="Tipo de dado" value={attributeForm.data_type} onChange={value=>setAttributeForm({...attributeForm,data_type:value})} required options={[{value:"text",label:"Texto"},{value:"number",label:"Número"},{value:"date",label:"Data"},{value:"boolean",label:"Sim / Não"}]}/>
        <div className="flex items-end justify-between gap-3"><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={attributeForm.required} onChange={event=>setAttributeForm({...attributeForm,required:event.target.checked})}/> Obrigatório</label><div className="flex gap-2"><button type="button" className="h-10 rounded-lg border px-3 text-sm" hidden={!attributeForm.id} onClick={()=>setAttributeForm({id:"",key:"",label:"",data_type:"text",required:false})}>Cancelar</button><button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={saving}><Plus className="mr-2 inline h-4 w-4"/>{attributeForm.id?"Salvar campo":"Adicionar campo"}</button></div></div>
      </form>
      <Table headers={["Chave","Nome","Tipo","Obrigatório","Ações"]} rows={materialAttributes.map(attribute=>[attribute.key,attribute.label,attribute.data_type,attribute.required?"Sim":"Não",<div className="flex gap-2"><button type="button" title="Editar campo" className="rounded-md border px-2 py-2" onClick={()=>setAttributeForm({id:attribute.id,key:attribute.key,label:attribute.label,data_type:attribute.data_type,required:attribute.required})}><Pencil className="h-3.5 w-3.5"/></button><button type="button" title="Excluir campo" className="rounded-md border px-2 py-2 hover:bg-destructive/5" onClick={()=>{if(!window.confirm(`Excluir a configuração do campo "${attribute.label}"? Os valores já gravados nos materiais serão preservados.`))return;void runSave(async()=>{const {error}=await db.from("material_attributes").delete().eq("id",attribute.id).eq("org_id",orgId);if(error)throw error;if(attributeForm.id===attribute.id)setAttributeForm({id:"",key:"",label:"",data_type:"text",required:false});},"Configuração removida; valores históricos preservados.");}}><Ban className="h-3.5 w-3.5"/></button></div>])}/>
    </Panel>
    <Panel title="Auditoria da organização" description="Ações relevantes registradas pelo banco; somente Gestão pode consultar estes registros.">
      <Table headers={["Data","Ação","Entidade","Registro","Usuário"]} rows={auditLogs.slice(0,30).map(log=>[new Date(log.created_at).toLocaleString("pt-BR"),pretty(log.action),pretty(log.entity),pretty(log.entity_id),members.find(member=>member.user_id===log.user_id)?.profiles?.email??(log.user_id?"Usuário sem perfil carregado":"Sistema")])}/>
      <p className="mt-2 text-xs text-muted-foreground">Exibindo até 30 eventos mais recentes carregados. O conteúdo detalhado dos registros permanece no banco para rastreabilidade.</p>
    </Panel>
    <Panel title="Notas de segurança e configuração" description="Ambiente demonstrativo com perfis isolados e dados fictícios.">
      <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>Consulta, Operação e Gestão usam contas demonstrativas distintas no mesmo ambiente de dados fictícios.</li><li>As permissões são verificadas pelo Supabase Auth e pelas políticas RLS do banco; ocultar botões não substitui a segurança do backend.</li><li>A chave service_role permanece exclusivamente no servidor e nunca é enviada ao navegador.</li><li>A nova migração de perfis demonstrativos e inventário precisa ser aplicada ao projeto Supabase antes de usar os três acessos pela primeira vez.</li></ul>
    </Panel>
  </div>;

  const active = visibleNav.find(n=>n.id===section);
  return <div className="min-h-screen w-full max-w-full overflow-x-clip bg-background text-foreground md:flex">
    <aside className="flex min-w-0 w-full max-w-full flex-col border-b bg-[var(--sidebar)] text-[var(--sidebar-foreground)] md:fixed md:inset-y-0 md:w-64 md:border-b-0 md:border-r md:border-[var(--sidebar-border)]">
      <div className="flex items-center gap-3 border-b border-[var(--sidebar-border)] px-5 py-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Warehouse className="h-5 w-5"/></div><div><p className="text-lg font-bold">armaZen</p><p className="text-xs text-[var(--sidebar-muted)]">Sistema de gestão de armazém</p></div></div>
      <nav aria-label="Navegação principal" className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-3 md:flex md:flex-1 md:flex-col">{visibleNav.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>{setSection(item.id);setSearch("");setMessage("");setDataError("");}} className={`flex min-h-[3.25rem] min-w-0 items-start gap-2 rounded-lg px-3 py-3 text-left text-sm transition-colors ${section===item.id?"bg-[var(--sidebar-accent)] font-semibold text-[var(--sidebar-accent-foreground)]":"text-[var(--sidebar-foreground)]/75 hover:bg-[var(--sidebar-accent)]"}`}><Icon className="mt-0.5 h-4 w-4 shrink-0"/><span className="min-w-0 whitespace-normal break-words leading-snug [overflow-wrap:anywhere]">{item.label}</span></button>;})}</nav>
      <div className="hidden border-t border-[var(--sidebar-border)] p-4 text-xs text-[var(--sidebar-muted)] md:block">Protótipo acadêmico · armaZen</div>
    </aside>
    <main className="min-w-0 w-full max-w-full flex-1 md:ml-64">
      <header className="flex min-w-0 flex-col items-start gap-3 border-b bg-card px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="min-w-0 w-full sm:flex-1">
          <p className="break-words text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">Operação / {active?.label}</p>
          <h1 className="mt-1 w-full max-w-full whitespace-normal break-words text-xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-xl">{section==="dashboard"?"Visão geral da operação":active?.label}</h1>
        </div>
        <div className="flex w-full max-w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <div className="min-w-0 text-left sm:text-right">
            <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{orgName||"Organização não identificada"}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <button onClick={()=>void supabase.auth.signOut()} className="h-9 shrink-0 rounded-lg border px-3 text-xs font-medium text-muted-foreground hover:bg-muted" title="Sair">Sair</button>
        </div>
      </header>
      <div className="min-w-0 w-full max-w-full space-y-4 px-3 py-4 sm:p-8">
        {message&&<div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">{message}</div>}
        {dataError&&<div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive"/><div className="flex-1">{dataError}</div><button onClick={()=>{setDataError("");refresh();}} className="font-medium underline">Tentar novamente</button></div>}
        {loading&&<p className="text-sm text-muted-foreground">Atualizando dados do Supabase…</p>}
        {section==="dashboard"&&dashboard}
        {section==="warehouse"&&warehouseSection}
        {section==="materials"&&materialsSection}
        {section==="movements"&&movementsSection}
        {section==="inventory"&&inventorySection}
        {section==="tasks"&&tasksSection}
        {section==="exports"&&exportsSection}
        {section==="settings"&&settingsSection}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>armaZen · Sistema de Gestão de Armazém</span><span>Exportação por arquivo; sem integração automática com ERP.</span></footer>
      </div>
    </main>
  </div>;
}

function AdjustmentForm({ orgId, materials, locations, saving, onSave, onDone, countId, warehouseId }: {
  orgId: string; materials: AnyRow[]; locations: AnyRow[]; saving: boolean;
  onSave: (fn:()=>Promise<unknown>, success:string)=>Promise<void>; onDone:()=>void;
  countId?: string; warehouseId?: string | null;
}) {
  const [form,setForm]=useState({material_id:"",location_id:"",lot:"",counted:"0",reason:""});
  return <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={e=>{e.preventDefault();void onSave(async()=>{if(!form.material_id||!form.location_id)throw new Error("Selecione material e endereço.");if(!form.reason.trim())throw new Error("Informe o motivo do ajuste.");const counted=Number(form.counted);if(!Number.isFinite(counted)||counted<0)throw new Error("A contagem precisa ser zero ou maior.");const rpcArgs={_material:form.material_id,_location:form.location_id,_lot:form.lot||"",_counted:counted,_reason:form.reason.trim(),_org:orgId,...(countId?{_count:countId}:{})};const {error}=await db.rpc("register_adjustment",rpcArgs);if(error)throw error;setForm({material_id:"",location_id:"",lot:"",counted:"0",reason:""});onDone();},"Ajuste de inventário registrado.");}}><SelectField label="Material" value={form.material_id} onChange={v=>setForm({...form,material_id:v})} required options={materials.filter(m=>m.status==="ativo"||m.status==="active").map(m=>({value:m.id,label:`${m.code} — ${m.description}`}))}/><SelectField label="Endereço" value={form.location_id} onChange={v=>setForm({...form,location_id:v})} required options={locations.filter(l=>l.active&&l.status!=="bloqueado"&&(!warehouseId||l.warehouse_id===warehouseId)).map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><Field label="Lote" value={form.lot} onChange={v=>setForm({...form,lot:v})}/><Field label="Quantidade contada" type="number" min={0} step={0.01} value={form.counted} onChange={v=>setForm({...form,counted:v})} required/><Field label="Motivo obrigatório" value={form.reason} onChange={v=>setForm({...form,reason:v})} required/><div className="flex items-end"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Registrar ajuste</button></div></form>;
}
