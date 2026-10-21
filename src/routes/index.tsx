/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import {
  Activity, AlertTriangle, ArrowLeftRight, Boxes, CheckCircle2, ClipboardCheck,
  ClipboardList, Download, LayoutDashboard, MapPinned, Package, Plus, RefreshCw,
  ShieldCheck, Warehouse, Pencil, Search, Ban, Check, Users, CalendarCheck,
} from "lucide-react";
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
const locationStatuses = ["disponivel", "bloqueado", "reservado"];
const datasets: Record<string, { label: string; table: string; fields: string[] }> = {
  materials: { label: "Materiais", table: "materials", fields: ["code", "description", "category", "unit", "barcode", "min_stock", "status", "tracks_lot", "created_at"] },
  balances: { label: "Saldos de estoque", table: "inventory_balances", fields: ["material_id", "location_id", "lot", "quantity", "expiry_date", "updated_at"] },
  locations: { label: "Endereços", table: "locations", fields: ["code", "name", "warehouse_id", "level_id", "parent_id", "status", "capacity", "capacity_unit", "active", "notes"] },
  movements: { label: "Movimentações", table: "stock_movements", fields: ["number", "type", "created_at", "material_id", "quantity", "from_location_id", "to_location_id", "lot", "reason", "reference", "notes", "user_id"] },
  counts: { label: "Inventário", table: "inventory_count_items", fields: ["count_id", "material_id", "location_id", "lot", "expected_qty", "counted_qty", "difference", "reason", "created_at", "user_id"] },
  tasks: { label: "Tarefas", table: "tasks", fields: ["title", "description", "type", "priority", "status", "assignee_id", "due_at", "material_id", "location_id", "created_at"] },
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
  return <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{action}</div>{children}</section>;
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
  return <div className="space-y-3">
    <div className="hidden overflow-x-auto rounded-lg border sm:block">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr>{headers.map(h => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{visibleRows.map((row, i) => <tr key={currentPage * pageSize + i} className="hover:bg-muted/30">{row.map((cell, j) => <td key={j} className="px-3 py-3 align-middle">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="grid gap-2 sm:hidden">
      {visibleRows.map((row, i) => <article key={currentPage * pageSize + i} className="rounded-lg border bg-card p-3">
        <dl className="grid gap-2">{row.map((cell, j) => <div key={j} className="grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.2fr)] gap-3 border-b pb-2 last:border-0 last:pb-0"><dt className="text-xs font-medium text-muted-foreground">{headers[j]}</dt><dd className="min-w-0 break-words text-sm">{cell}</dd></div>)}</dl>
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
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
};

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
  const [mapWarehouseId, setMapWarehouseId] = useState("");
  const [mapParentId, setMapParentId] = useState("");
  const [mapSelectedLocationId, setMapSelectedLocationId] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [inventoryForm, setInventoryForm] = useState({ warehouse_id: "", description: "" });
  const [attributeForm, setAttributeForm] = useState({ key: "", label: "", data_type: "text", required: false });
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});

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
        if (!session) { setOrgId(""); setOrgName(""); setRole(""); }
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
          get("inventory_count_items"), get("inventory_counts"), get("material_attributes"),
          db.from("organization_members").select("id, user_id, role, created_at").eq("org_id", orgId).order("created_at", { ascending: true }),
        ]);
        const failed = results.find((r: AnyRow) => r.error);
        if (failed?.error) throw failed.error;
        if (cancelled) return;
        setWarehouses(results[0].data ?? []); setLevels(results[1].data ?? []); setLocations(results[2].data ?? []);
        setMaterials(results[3].data ?? []); setBalances(results[4].data ?? []); setMovements(results[5].data ?? []);
        setTasks(results[6].data ?? []); setTemplates(results[7].data ?? []); setHistory(results[8].data ?? []);
        setCounts(results[9].data ?? []);
        setInventorySessions(results[10].data ?? []);
        setMaterialAttributes(results[11].data ?? []);
        const memberRows = results[12].data ?? [];
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

  useEffect(() => { setSelectedFields(datasets[exportForm.dataset]?.fields ?? []); setPreview([]); }, [exportForm.dataset]);

  // Derived totals — useMemo must be before conditional returns
  const totals = useMemo(() => {
    const balanceByMaterial = new Map<string, number>();
    balances.forEach(b => balanceByMaterial.set(b.material_id, (balanceByMaterial.get(b.material_id) ?? 0) + Number(b.quantity || 0)));
    const since = Date.now() - Number(period) * 86400000;
    const open = tasks.filter(t => t.status !== "concluida");
    return {
      materials: materials.filter(m => m.status === "ativo" || m.status === "active").length,
      locations: locations.filter(l => l.active).length,
      units: balances.reduce((sum, b) => sum + Number(b.quantity || 0), 0),
      lowStock: materials.filter(m => (m.status === "ativo" || m.status === "active") && (balanceByMaterial.get(m.id) ?? 0) < Number(m.min_stock || 0)).length,
      movements: movements.filter(m => new Date(m.created_at).getTime() >= since).length,
      pending: open.length,
      overdue: open.filter(t => t.due_at && new Date(t.due_at).getTime() < Date.now()).length,
      divergences: counts.filter(c => Number(c.difference) !== 0).length,
    };
  }, [materials, locations, balances, movements, tasks, counts, period]);

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
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold">Indicadores operacionais</h2><p className="mt-1 text-sm text-muted-foreground">Calculados a partir dos registros retornados pelo Supabase.</p></div><div className="flex gap-2"><SelectField label="Período" value={period} onChange={setPeriod} options={[{value:"7",label:"7 dias"},{value:"30",label:"30 dias"},{value:"90",label:"90 dias"}]} /><button onClick={refresh} disabled={loading} className="mt-5 flex h-10 items-center gap-2 rounded-lg border px-3 text-sm"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</button></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Materiais ativos", totals.materials, Package], ["Endereços ativos", totals.locations, MapPinned],
        ["Unidades em estoque", new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(totals.units), Boxes],
        ["Abaixo do mínimo", totals.lowStock, AlertTriangle], [`Movimentações (${period} dias)`, totals.movements, Activity],
        ["Tarefas em aberto", totals.pending, ClipboardList], ["Tarefas atrasadas", totals.overdue, AlertTriangle],
        ["Divergências registradas", totals.divergences, CheckCircle2],
      ].map(([label, value, Icon]: any) => <article key={String(label)} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{label}</p><span className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4" /></span></div><p className="mt-4 text-3xl font-semibold">{orgId ? value : "—"}</p></article>)}
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <Panel title="Movimentações por tipo" description="Distribuição dos registros carregados.">
        {movementTypes.map(type=>{const n=movements.filter(m=>m.type===type).length;const max=Math.max(1,...movementTypes.map(t=>movements.filter(m=>m.type===t).length));return <div key={type} className="mb-3"><div className="mb-1 flex justify-between text-sm"><span className="capitalize">{type}</span><span>{n}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${n/max*100}%`}}/></div></div>;})}
      </Panel>
      <Panel title="Situação das tarefas" description="Tarefas por coluna do Kanban.">
        {taskStatuses.map(status=>{const n=tasks.filter(t=>t.status===status).length;const max=Math.max(1,...taskStatuses.map(t=>tasks.filter(x=>x.status===t).length));return <div key={status} className="mb-3"><div className="mb-1 flex justify-between text-sm"><span>{status.replaceAll("_"," ")}</span><span>{n}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${n/max*100}%`}}/></div></div>;})}
      </Panel>
      <Panel title="Situação dos endereços" description="Estados cadastrados; não representa ocupação física.">
        {locationStatuses.map(status=>{const n=locations.filter(l=>l.active&&l.status===status).length;const max=Math.max(1,...locationStatuses.map(t=>locations.filter(l=>l.active&&l.status===t).length));return <div key={status} className="mb-3"><div className="mb-1 flex justify-between text-sm"><span>{status.replaceAll("_"," ")}</span><span>{n}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${n/max*100}%`}}/></div></div>;})}
      </Panel>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Movimentações recentes" description="Últimos registros persistidos."><Table headers={["Nº","Tipo","Material","Quantidade","Data"]} rows={movements.slice(0,6).map(m => [pretty(m.number), statusPill(m.type), pretty(materials.find(x=>x.id===m.material_id)?.code), pretty(m.quantity), dateLabel(m.created_at)])} /></Panel>
      <Panel title="Tarefas prioritárias" description="Tarefas abertas, incluindo prazos vencidos."><Table headers={["Tarefa","Prioridade","Status","Prazo"]} rows={tasks.filter(t=>t.status!=="concluida").sort((a,b)=>Number(new Date(a.due_at||"9999").getTime())-Number(new Date(b.due_at||"9999").getTime())).slice(0,6).map(t=>[t.title,statusPill(t.priority),statusPill(t.status),dateLabel(t.due_at)])} /></Panel>
    </div>
  </div>;

  const warehouseSection = <div className="space-y-5">
    <Panel title="Armazéns" description="Cadastre instalações genéricas. Desativar preserva vínculos e histórico.">
      {canManage && <form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault(); void runSave(async()=>{const payload={code:whForm.code.trim(),name:whForm.name.trim(),description:whForm.description.trim()||null,org_id:orgId,active:true,updated_at:new Date().toISOString()}; if(whForm.id) {const {error}=await db.from("warehouses").update(payload).eq("id",whForm.id).eq("org_id",orgId);if(error)throw error;} else {const {error}=await db.from("warehouses").insert(payload);if(error)throw error;} setWhForm({id:"",code:"",name:"",description:""});},"Armazém salvo.");}}> <Field label="Código" value={whForm.code} onChange={v=>setWhForm({...whForm,code:v})} required/><Field label="Nome" value={whForm.name} onChange={v=>setWhForm({...whForm,name:v})} required/><Field label="Descrição" value={whForm.description} onChange={v=>setWhForm({...whForm,description:v})}/><div className="flex items-end gap-2"><button disabled={saving} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4"/>{whForm.id?"Salvar edição":"Cadastrar"}</button>{whForm.id&&<button type="button" className="h-10 rounded-lg border px-3 text-sm" onClick={()=>setWhForm({id:"",code:"",name:"",description:""})}>Cancelar</button>}</div></form>}
      <Table headers={["Código","Armazém","Descrição","Situação","Ações"]} rows={warehouses.map(w=>[w.code,w.name,pretty(w.description),w.active?"Ativo":"Inativo",<div className="flex gap-2">{canManage&&<button title="Editar" className="rounded border p-2" onClick={()=>setWhForm({id:w.id,code:w.code,name:w.name,description:w.description??""})}><Pencil className="h-4 w-4"/></button>}{canManage&&<button title={w.active?"Desativar":"Ativar"} className="rounded border p-2" onClick={()=>void runSave(async()=>{const {error}=await db.from("warehouses").update({active:!w.active,updated_at:new Date().toISOString()}).eq("id",w.id).eq("org_id",orgId);if(error)throw error;},"Situação atualizada.")}>{w.active?<Ban className="h-4 w-4"/>:<Check className="h-4 w-4"/>}</button>}</div>])}/>
    </Panel>
    <Panel title="Níveis configuráveis" description="A profundidade da hierarquia é definida pelos níveis e relações pai/filho.">
      {canManage&&<form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const p={org_id:orgId,warehouse_id:levelForm.warehouse_id,name:levelForm.name.trim(),sort_order:Number(levelForm.sort_order),is_storage:levelForm.is_storage};const q=levelForm.id?db.from("location_levels").update(p).eq("id",levelForm.id):db.from("location_levels").insert(p);const {error}=await q;if(error)throw error;setLevelForm({id:"",warehouse_id:"",name:"",sort_order:"1",is_storage:true});},"Nível salvo.");}}><SelectField label="Armazém" value={levelForm.warehouse_id} onChange={v=>setLevelForm({...levelForm,warehouse_id:v})} required options={warehouses.filter(w=>w.active).map(w=>({value:w.id,label:w.name}))}/><Field label="Nome do nível" value={levelForm.name} onChange={v=>setLevelForm({...levelForm,name:v})} required/><Field label="Ordem" type="number" min={0} value={levelForm.sort_order} onChange={v=>setLevelForm({...levelForm,sort_order:v})}/><div className="flex items-end gap-2"><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={levelForm.is_storage} onChange={e=>setLevelForm({...levelForm,is_storage:e.target.checked})}/> É endereço de armazenagem</label><button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={saving}>Salvar nível</button></div></form>}
      <Table headers={["Armazém","Nível","Ordem","Armazenagem","Ações"]} rows={levels.map(l=>[pretty(warehouses.find(w=>w.id===l.warehouse_id)?.name),l.name,l.sort_order,l.is_storage?"Sim":"Não",canManage?<button className="rounded border p-2" title="Editar nível" onClick={()=>setLevelForm({id:l.id,warehouse_id:l.warehouse_id,name:l.name,sort_order:String(l.sort_order),is_storage:l.is_storage})}><Pencil className="h-4 w-4"/></button>:"—"])}/>
    </Panel>
    <Panel title="Endereços" description="Estados: disponível, reservado ou bloqueado. A posição visual é esquemática, não uma planta real.">
      {canManage&&<form className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const p={org_id:orgId,warehouse_id:locForm.warehouse_id,level_id:locForm.level_id,parent_id:locForm.parent_id||null,code:locForm.code.trim(),name:locForm.name.trim(),status:locForm.status,capacity:locForm.capacity?Number(locForm.capacity):null,capacity_unit:locForm.capacity_unit||null,notes:locForm.notes||null,active:true,updated_at:new Date().toISOString()};const q=locForm.id?db.from("locations").update(p).eq("id",locForm.id):db.from("locations").insert(p);const {error}=await q;if(error)throw error;setLocForm({id:"",warehouse_id:"",level_id:"",parent_id:"",code:"",name:"",status:"disponivel",capacity:"",capacity_unit:"un",notes:""});},"Endereço salvo.");}}><SelectField label="Armazém" value={locForm.warehouse_id} onChange={v=>setLocForm({...locForm,warehouse_id:v,level_id:"",parent_id:""})} required options={warehouses.filter(w=>w.active).map(w=>({value:w.id,label:w.name}))}/><SelectField label="Nível" value={locForm.level_id} onChange={v=>setLocForm({...locForm,level_id:v})} required options={levels.filter(l=>l.warehouse_id===locForm.warehouse_id).map(l=>({value:l.id,label:l.name}))}/><SelectField label="Endereço pai" value={locForm.parent_id} onChange={v=>setLocForm({...locForm,parent_id:v})} options={locations.filter(l=>l.warehouse_id===locForm.warehouse_id&&l.id!==locForm.id).map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><Field label="Código" value={locForm.code} onChange={v=>setLocForm({...locForm,code:v})} required/><Field label="Nome" value={locForm.name} onChange={v=>setLocForm({...locForm,name:v})} required/><SelectField label="Situação" value={locForm.status} onChange={v=>setLocForm({...locForm,status:v})} options={locationStatuses.map(v=>({value:v,label:v.replaceAll("_"," ")}))} required/><Field label="Capacidade" type="number" min={0} step={0.01} value={locForm.capacity} onChange={v=>setLocForm({...locForm,capacity:v})}/><Field label="Unidade da capacidade" value={locForm.capacity_unit} onChange={v=>setLocForm({...locForm,capacity_unit:v})}/><Field label="Observações" value={locForm.notes} onChange={v=>setLocForm({...locForm,notes:v})}/><div className="flex items-end gap-2"><button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={saving}>Salvar endereço</button>{locForm.id&&<button type="button" className="h-10 rounded-lg border px-3 text-sm" onClick={()=>setLocForm({id:"",warehouse_id:"",level_id:"",parent_id:"",code:"",name:"",status:"disponivel",capacity:"",capacity_unit:"un",notes:""})}>Cancelar</button>}</div></form>}
      <div className="mb-3 flex gap-2"><Search className="mt-2.5 h-4 w-4 text-muted-foreground"/><input className="h-10 w-full max-w-sm rounded-lg border bg-background px-3 text-sm" placeholder="Pesquisar código, nome ou nível" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <Table headers={["Código","Nome","Armazém / nível","Pai","Situação","Saldo","Ações"]} rows={filtered(locations,["code","name","status"]).map(l=>{const qty=balances.filter(b=>b.location_id===l.id).reduce((s,b)=>s+Number(b.quantity||0),0);return [l.code,l.name,`${warehouses.find(w=>w.id===l.warehouse_id)?.name??"—"} / ${levels.find(x=>x.id===l.level_id)?.name??"—"}`,pretty(locations.find(x=>x.id===l.parent_id)?.code),statusPill(l.status),qty,canManage?<div className="flex gap-2"><button className="rounded border p-2" onClick={()=>setLocForm({id:l.id,warehouse_id:l.warehouse_id,level_id:l.level_id,parent_id:l.parent_id??"",code:l.code,name:l.name,status:l.status,capacity:l.capacity==null?"":String(l.capacity),capacity_unit:l.capacity_unit??"un",notes:l.notes??""})}><Pencil className="h-4 w-4"/></button><button className="rounded border p-2" title="Desativar endereço" onClick={()=>void runSave(async()=>{if(qty>0)throw new Error("Não é possível desativar um endereço com saldo. Transfira o estoque antes.");const {error}=await db.from("locations").update({active:false,updated_at:new Date().toISOString()}).eq("id",l.id).eq("org_id",orgId);if(error)throw error;},"Endereço desativado.")}><Ban className="h-4 w-4"/></button></div>:"—"]})}/>
    </Panel>
    <Panel title="Mapa esquemático" description="Representação simplificada dos endereços cadastrados; não substitui uma planta física.">
      {locations.filter(l=>l.active).length===0?<Empty>Cadastre endereços para visualizar a estrutura.</Empty>:<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{locations.filter(l=>l.active).map(l=><article key={l.id} className={`rounded-lg border p-4 ${l.status==="bloqueado"?"border-destructive/50 bg-destructive/5":l.status==="reservado"?"border-amber-500/50 bg-amber-500/5":"bg-card"}`}><div className="flex items-start justify-between gap-2"><strong>{l.code}</strong>{statusPill(l.status)}</div><p className="mt-1 text-sm">{l.name}</p><p className="mt-2 text-xs text-muted-foreground">{warehouses.find(w=>w.id===l.warehouse_id)?.name} · {levels.find(x=>x.id===l.level_id)?.name}</p><p className="mt-2 text-xs">Saldo: {balances.filter(b=>b.location_id===l.id).reduce((s,b)=>s+Number(b.quantity||0),0)} unidades</p></article>)}</div>}
    </Panel>
  </div>;

  const materialsSection = <div className="space-y-5">
    <Panel title={matForm.id?"Editar material":"Cadastrar material"} description="Os saldos são lidos de inventory_balances; não são editados diretamente nesta tela.">
      {canOperate?<form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault();void runSave(async()=>{let attrs:AnyRow;try{attrs=JSON.parse(matForm.attributes||"{}");if(!attrs||Array.isArray(attrs)||typeof attrs!=="object")throw new Error();}catch{throw new Error("Atributos adicionais precisam estar em formato JSON de objeto.");}const p={org_id:orgId,code:matForm.code.trim(),description:matForm.description.trim(),category:matForm.category.trim(),unit:matForm.unit.trim(),barcode:matForm.barcode.trim()||null,min_stock:Number(matForm.min_stock),status:matForm.status,tracks_lot:matForm.tracks_lot,attributes:attrs,updated_at:new Date().toISOString()};const q=matForm.id?db.from("materials").update(p).eq("id",matForm.id):db.from("materials").insert(p);const {error}=await q;if(error)throw error;setMatForm({id:"",code:"",description:"",category:"Geral",unit:"un",barcode:"",min_stock:"0",status:"ativo",tracks_lot:false,attributes:"{}"});},"Material salvo.");}}><Field label="Código interno" value={matForm.code} onChange={v=>setMatForm({...matForm,code:v})} required/><Field label="Descrição" value={matForm.description} onChange={v=>setMatForm({...matForm,description:v})} required/><Field label="Categoria" value={matForm.category} onChange={v=>setMatForm({...matForm,category:v})} required/><Field label="Unidade de medida" value={matForm.unit} onChange={v=>setMatForm({...matForm,unit:v})} required/><Field label="Código de barras (opcional)" value={matForm.barcode} onChange={v=>setMatForm({...matForm,barcode:v})}/><Field label="Estoque mínimo" type="number" min={0} step={0.01} value={matForm.min_stock} onChange={v=>setMatForm({...matForm,min_stock:v})} required/><SelectField label="Status" value={matForm.status} onChange={v=>setMatForm({...matForm,status:v})} options={[{value:"ativo",label:"Ativo"},{value:"inativo",label:"Inativo"}]} required/><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={matForm.tracks_lot} onChange={e=>setMatForm({...matForm,tracks_lot:e.target.checked})}/> Controla lote/validade</label><label className="grid gap-1.5 text-sm sm:col-span-2 xl:col-span-3"><span className="font-medium">Atributos adicionais (JSON)</span><textarea className="min-h-20 rounded-lg border bg-background p-3 font-mono text-xs" value={matForm.attributes} onChange={e=>setMatForm({...matForm,attributes:e.target.value})}/></label><div className="flex items-end gap-2"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">{matForm.id?"Salvar alterações":"Cadastrar material"}</button>{matForm.id&&<button type="button" className="h-10 rounded-lg border px-3 text-sm" onClick={()=>setMatForm({id:"",code:"",description:"",category:"Geral",unit:"un",barcode:"",min_stock:"0",status:"ativo",tracks_lot:false,attributes:"{}"})}>Cancelar</button>}</div></form>:<Empty>O perfil atual não possui permissão para cadastrar ou editar materiais.</Empty>}
    </Panel>
    <Panel title="Materiais e saldos" description="Pesquise por código, descrição, categoria ou código de barras.">
      <div className="mb-3 flex gap-2"><Search className="mt-2.5 h-4 w-4 text-muted-foreground"/><input className="h-10 w-full max-w-sm rounded-lg border bg-background px-3 text-sm" placeholder="Pesquisar material..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <Table headers={["Código","Descrição","Categoria","Unidade","Saldo total","Mínimo","Situação","Ações"]} rows={filtered(materials,["code","description","category","barcode"]).map(m=>{const qty=balances.filter(b=>b.material_id===m.id).reduce((s,b)=>s+Number(b.quantity||0),0);return [m.code,m.description,m.category,m.unit,qty,m.min_stock,qty<Number(m.min_stock||0)?<span className="font-semibold text-amber-700">Abaixo do mínimo</span>:statusPill(m.status),<div className="flex gap-2">{canOperate&&<button className="rounded border p-2" title="Editar" onClick={()=>setMatForm({id:m.id,code:m.code,description:m.description,category:m.category,unit:m.unit,barcode:m.barcode??"",min_stock:String(m.min_stock),status:m.status,tracks_lot:m.tracks_lot,attributes:JSON.stringify(m.attributes??{},null,2)})}><Pencil className="h-4 w-4"/></button>}{canManage&&<button className="rounded border p-2" title="Alternar status" onClick={()=>void runSave(async()=>{const {error}=await db.from("materials").update({status:m.status==="ativo"?"inativo":"ativo",updated_at:new Date().toISOString()}).eq("id",m.id).eq("org_id",orgId);if(error)throw error;},"Status atualizado.")}>{m.status==="ativo"?<Ban className="h-4 w-4"/>:<Check className="h-4 w-4"/>}</button>}</div>]})}/>
    </Panel>
    <Panel title="Saldo por endereço" description="Lote e validade são exibidos quando registrados."><Table headers={["Material","Endereço","Lote","Quantidade","Validade"]} rows={balances.filter(b=>Number(b.quantity)!==0).map(b=>[pretty(materials.find(m=>m.id===b.material_id)?.code),pretty(locations.find(l=>l.id===b.location_id)?.code),pretty(b.lot),b.quantity,dateLabel(b.expiry_date)])}/></Panel>
  </div>;

  const movementsSection = <div className="space-y-5">
    <Panel title="Registrar movimentação" description="Entrada, saída e transferência usam a função transacional do banco. Ajustes de inventário exigem contagem física e justificativa.">
      {canOperate?<form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const qty=Number(moveForm.quantity);if(!moveForm.material_id)throw new Error("Selecione um material.");if(!Number.isFinite(qty)||qty<=0)throw new Error("A quantidade precisa ser maior que zero.");if(moveForm.type==="entrada"&&!moveForm.to_location_id)throw new Error("Selecione o endereço de destino.");if(moveForm.type==="saida"&&!moveForm.from_location_id)throw new Error("Selecione o endereço de origem.");if(moveForm.type==="transferencia"&&(!moveForm.from_location_id||!moveForm.to_location_id||moveForm.from_location_id===moveForm.to_location_id))throw new Error("Transferência exige origem e destino diferentes.");if(moveForm.type==="ajuste"){throw new Error("Use a ação de ajuste físico no formulário de inventário abaixo.");}const {error}=await db.rpc("register_movement",{_type:moveForm.type,_material:moveForm.material_id,_qty:qty,_org:orgId,_from:moveForm.from_location_id||null,_to:moveForm.to_location_id||null,_lot:moveForm.lot||"",_reference:moveForm.reference||"",_notes:[moveForm.reason,moveForm.notes].filter(Boolean).join(" — "),_request:crypto.randomUUID()});if(error)throw error;setMoveForm({...moveForm,quantity:"1",lot:"",reference:"",reason:"",notes:""});},"Movimentação registrada.");}}><SelectField label="Tipo" value={moveForm.type} onChange={v=>setMoveForm({...moveForm,type:v})} options={movementTypes.filter(v=>v!=="ajuste").map(v=>({value:v,label:v.replaceAll("_"," ")}))} required/><SelectField label="Material" value={moveForm.material_id} onChange={v=>setMoveForm({...moveForm,material_id:v})} options={materials.filter(m=>m.status==="ativo"||m.status==="active").map(m=>({value:m.id,label:`${m.code} — ${m.description}`}))} required/><Field label="Quantidade" type="number" min={0.01} step={0.01} value={moveForm.quantity} onChange={v=>setMoveForm({...moveForm,quantity:v})} required/><SelectField label="Origem" value={moveForm.from_location_id} onChange={v=>setMoveForm({...moveForm,from_location_id:v})} options={locations.filter(l=>l.active&&l.status!=="bloqueado").map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><SelectField label="Destino" value={moveForm.to_location_id} onChange={v=>setMoveForm({...moveForm,to_location_id:v})} options={locations.filter(l=>l.active&&l.status!=="bloqueado").map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><Field label="Lote (quando aplicável)" value={moveForm.lot} onChange={v=>setMoveForm({...moveForm,lot:v})}/><Field label="Referência documental" value={moveForm.reference} onChange={v=>setMoveForm({...moveForm,reference:v})}/><Field label="Motivo" value={moveForm.reason} onChange={v=>setMoveForm({...moveForm,reason:v})}/><Field label="Observações" value={moveForm.notes} onChange={v=>setMoveForm({...moveForm,notes:v})}/><div className="flex items-end"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Confirmar movimentação</button></div></form>:<Empty>O perfil atual não possui permissão para registrar movimentações.</Empty>}
    </Panel>
    <Panel title="Ajuste de inventário" description="Registra a contagem física e diferença por meio da rotina de ajuste do banco.">
      {canOperate?<AdjustmentForm orgId={orgId} materials={materials} locations={locations} saving={saving} onSave={runSave} onDone={refresh}/>:<Empty>O perfil atual não possui permissão para ajustar estoque.</Empty>}
    </Panel>
    <Panel title="Histórico de movimentações" description="Registros concluídos são preservados; correções devem usar estorno rastreável.">
      <div className="mb-3 flex gap-2"><Search className="mt-2.5 h-4 w-4 text-muted-foreground"/><input className="h-10 w-full max-w-sm rounded-lg border bg-background px-3 text-sm" placeholder="Pesquisar tipo, lote, motivo ou referência" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <Table headers={["Nº","Data","Tipo","Material","Quantidade","Origem","Destino","Referência / motivo","Estorno"]} rows={filtered(movements,["type","lot","reason","reference","notes"]).map(m=>[pretty(m.number),new Date(m.created_at).toLocaleString("pt-BR"),statusPill(m.type),pretty(materials.find(x=>x.id===m.material_id)?.code),m.quantity,pretty(locations.find(x=>x.id===m.from_location_id)?.code),pretty(locations.find(x=>x.id===m.to_location_id)?.code),pretty(m.reference||m.reason),m.reversed_by?"Estornado":canOperate?<button className="rounded border px-2 py-1 text-xs" onClick={()=>{const reason=window.prompt("Motivo do estorno (obrigatório):");if(reason?.trim())void runSave(async()=>{const {error}=await db.rpc("reverse_movement",{_movement:m.id,_reason:reason.trim()});if(error)throw error;},"Estorno registrado.");}}>Estornar</button>:"—"])}/></Panel>
    <Panel title="Contagens de inventário" description="Histórico de diferenças registradas."><Table headers={["Data","Material","Endereço","Lote","Esperado","Contado","Diferença","Motivo"]} rows={counts.map(c=>[dateLabel(c.created_at),pretty(materials.find(m=>m.id===c.material_id)?.code),pretty(locations.find(l=>l.id===c.location_id)?.code),pretty(c.lot),c.expected_qty,c.counted_qty,c.difference,pretty(c.reason)])}/></Panel>
  </div>;

  const tasksSection = <div className="space-y-5">
    <Panel title={taskForm.id?"Editar tarefa":"Criar tarefa operacional"} description="Alterar o status da tarefa não movimenta estoque. A operação física deve ser registrada no módulo Movimentações.">
      {canOperate?<form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const p={org_id:orgId,title:taskForm.title.trim(),description:taskForm.description.trim()||null,type:taskForm.type,priority:taskForm.priority,status:taskForm.status,assignee_id:taskForm.assignee_id||null,due_at:taskForm.due_at?new Date(taskForm.due_at).toISOString():null,material_id:taskForm.material_id||null,location_id:taskForm.location_id||null,updated_at:new Date().toISOString(),completed_at:taskForm.status==="concluida"?new Date().toISOString():null,...(!taskForm.id?{created_by:user?.id}:{})};const q=taskForm.id?db.from("tasks").update(p).eq("id",taskForm.id):db.from("tasks").insert(p);const {error}=await q;if(error)throw error;setTaskForm({id:"",title:"",description:"",type:"recebimento",priority:"media",status:"a_fazer",assignee_id:"",due_at:"",material_id:"",location_id:""});},"Tarefa salva.");}}><Field label="Título" value={taskForm.title} onChange={v=>setTaskForm({...taskForm,title:v})} required/><SelectField label="Tipo de tarefa" value={taskForm.type} onChange={v=>setTaskForm({...taskForm,type:v})} options={taskTypes.map(v=>({value:v,label:v.replaceAll("_"," ")}))} required/><SelectField label="Prioridade" value={taskForm.priority} onChange={v=>setTaskForm({...taskForm,priority:v})} options={priorities.map(v=>({value:v,label:v}))} required/><SelectField label="Status" value={taskForm.status} onChange={v=>setTaskForm({...taskForm,status:v})} options={taskStatuses.map(v=>({value:v,label:v.replaceAll("_"," ")}))} required/><Field label="Prazo" type="datetime-local" value={taskForm.due_at} onChange={v=>setTaskForm({...taskForm,due_at:v})}/><SelectField label="Responsável (membro)" value={taskForm.assignee_id} onChange={v=>setTaskForm({...taskForm,assignee_id:v})} options={members.map(m=>({value:m.user_id,label:m.profiles?.full_name||m.profiles?.email||m.user_id.slice(0,8)}))}/><SelectField label="Material relacionado" value={taskForm.material_id} onChange={v=>setTaskForm({...taskForm,material_id:v})} options={materials.map(m=>({value:m.id,label:`${m.code} — ${m.description}`}))}/><SelectField label="Endereço relacionado" value={taskForm.location_id} onChange={v=>setTaskForm({...taskForm,location_id:v})} options={locations.map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><label className="grid gap-1.5 text-sm sm:col-span-2"><span className="font-medium">Descrição</span><textarea className="min-h-20 rounded-lg border bg-background p-3" value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})}/></label><div className="flex items-end gap-2"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">{taskForm.id?"Salvar alterações":"Criar tarefa"}</button>{taskForm.id&&<button type="button" className="h-10 rounded-lg border px-3 text-sm" onClick={()=>setTaskForm({id:"",title:"",description:"",type:"recebimento",priority:"media",status:"a_fazer",assignee_id:"",due_at:"",material_id:"",location_id:""})}>Cancelar</button>}</div></form>:<Empty>O perfil atual não possui permissão para criar ou atualizar tarefas.</Empty>}
    </Panel>
    <Panel title="Quadro Kanban" description="Status persistidos no banco, com filtros por texto e alertas de prazo.">
      <div className="mb-4 flex gap-2"><Search className="mt-2.5 h-4 w-4 text-muted-foreground"/><input className="h-10 w-full max-w-sm rounded-lg border bg-background px-3 text-sm" placeholder="Pesquisar tarefas..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{taskStatuses.map(status=><div key={status} className="min-h-48 rounded-xl bg-muted/40 p-3"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{status.replaceAll("_"," ")}</h3><span className="rounded-full bg-background px-2 py-0.5 text-xs">{tasks.filter(t=>t.status===status).length}</span></div><div className="space-y-3">{filtered(tasks.filter(t=>t.status===status),["title","description","type","priority"]).map(t=><article key={t.id} className="rounded-lg border bg-card p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><p className="font-medium">{t.title}</p>{t.priority==="urgente"||t.priority==="alta"?<AlertTriangle className="h-4 w-4 shrink-0 text-amber-600"/>:null}</div><p className="mt-1 text-xs text-muted-foreground">{t.type.replaceAll("_"," ")} · {t.priority}</p><p className={`mt-2 text-xs ${t.due_at&&new Date(t.due_at).getTime()<Date.now()&&t.status!=="concluida"?"font-semibold text-destructive":"text-muted-foreground"}`}>Prazo: {dateLabel(t.due_at)}{t.due_at&&new Date(t.due_at).getTime()<Date.now()&&t.status!=="concluida"?" · atrasada":""}</p><div className="mt-3 flex flex-wrap gap-2">{canOperate&&<select aria-label="Alterar status" className="h-8 min-w-0 flex-1 rounded border bg-background px-2 text-xs" value={t.status} onChange={e=>void runSave(async()=>{const {error}=await db.from("tasks").update({status:e.target.value,updated_at:new Date().toISOString(),completed_at:e.target.value==="concluida"?new Date().toISOString():null}).eq("id",t.id).eq("org_id",orgId);if(error)throw error;},"Status da tarefa atualizado.")}>{taskStatuses.map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select>}{canOperate&&<button className="rounded border p-1.5" title="Editar tarefa" onClick={()=>setTaskForm({id:t.id,title:t.title,description:t.description??"",type:t.type,priority:t.priority,status:t.status,assignee_id:t.assignee_id??"",due_at:t.due_at?new Date(t.due_at).toISOString().slice(0,16):"",material_id:t.material_id??"",location_id:t.location_id??""})}><Pencil className="h-3.5 w-3.5"/></button>}</div></article>)}</div></div>)}</div>
    </Panel>
  </div>;

  const exportsSection = <div className="space-y-5">
    <Panel title="Preparar exportação" description="Gera arquivos a partir dos dados consultados. Isso não sincroniza nem importa dados em um ERP.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SelectField label="Conjunto de dados" value={exportForm.dataset} onChange={v=>setExportForm({...exportForm,dataset:v,template_id:""})} options={Object.entries(datasets).map(([value,d])=>({value,label:d.label}))}/><SelectField label="Formato" value={exportForm.format} onChange={v=>setExportForm({...exportForm,format:v})} options={[{value:"csv",label:"CSV"},{value:"xlsx",label:"XLSX"},{value:"json",label:"JSON"}]}/><Field label="Delimitador CSV" value={exportForm.delimiter} onChange={v=>setExportForm({...exportForm,delimiter:v||";"})}/><SelectField label="Modelo salvo" value={exportForm.template_id} onChange={v=>{const t=templates.find(x=>x.id===v);setExportForm({...exportForm,template_id:v,template_name:t?.name??""});if(t?.config?.fields)setSelectedFields(t.config.fields);if(t?.config?.delimiter)setExportForm(prev=>({...prev,template_id:v,template_name:t.name,delimiter:t.config.delimiter}));}} options={templates.filter(t=>t.dataset===exportForm.dataset).map(t=>({value:t.id,label:t.name}))}/></div>
      <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">Campos a exportar (selecione a ordem abaixo)</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{datasets[exportForm.dataset]!.fields.map(f=><label key={f} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={selectedFields.includes(f)} onChange={e=>setSelectedFields(old=>e.target.checked?[...old,f]:old.filter(x=>x!==f))}/>{f}</label>)}</div><p className="mt-2 text-xs text-muted-foreground">A ordem dos campos selecionados determina a ordem das colunas. Os modelos são personalizados, não layouts oficiais de ERP.</p></div>
      {canManage&&<div className="mt-4 flex flex-wrap items-end gap-3"><div className="w-full max-w-sm"><Field label="Nome do modelo para salvar" value={exportForm.template_name} onChange={v=>setExportForm({...exportForm,template_name:v})} placeholder="Ex.: Modelo ERP interno"/></div><button className="h-10 rounded-lg border px-4 text-sm font-medium" disabled={!exportForm.template_name.trim()||selectedFields.length===0||saving} onClick={()=>void runSave(async()=>{const payload={org_id:orgId,name:exportForm.template_name.trim(),dataset:exportForm.dataset,created_by:user?.id,config:{fields:selectedFields,delimiter:exportForm.delimiter,date_format:exportForm.date_format,format:exportForm.format},updated_at:new Date().toISOString()};const {error}=await db.from("export_templates").insert(payload);if(error)throw error;setExportForm({...exportForm,template_name:""});},"Modelo de exportação salvo.")}>Salvar modelo</button></div>}
      <div className="mt-4 max-w-sm"><Field label="Filtro textual da prévia" value={search} onChange={setSearch} placeholder="Filtrar registros carregados"/></div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><button className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" disabled={loading||selectedFields.length===0} onClick={async()=>{setDataError("");try{const d=datasets[exportForm.dataset]!;const {data,error}=await db.from(d.table).select("*").eq("org_id",orgId).limit(5000);if(error)throw error;const rows=(data??[]).map((row:AnyRow)=>Object.fromEntries(selectedFields.map(f=>[f,row[f]??""])));const query=search.trim().toLowerCase();const filteredRows=query?rows.filter((row:AnyRow)=>Object.values(row).some(v=>String(v??"").toLowerCase().includes(query))):rows;setPreview(filteredRows);notify(`Prévia carregada: ${filteredRows.length} registro(s) após filtro. Limite consultado: 5.000 registros.`);}catch(e){fail(e);}}}><Search className="h-4 w-4"/> Pré-visualizar</button><button className="flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold" disabled={preview.length===0||!orgId} onClick={()=>void (async()=>{try{const columns=selectedFields;const safeName=datasets[exportForm.dataset]!.label.toLowerCase().replace(/[^a-z0-9]+/g,"-");if(exportForm.format==="json"){downloadBlob(new Blob([JSON.stringify(preview,null,2)],{type:"application/json;charset=utf-8"}),`armazen-${safeName}.json`);}else if(exportForm.format==="xlsx"){const sheet=XLSX.utils.json_to_sheet(preview,{header:columns});const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,"Dados");const out=XLSX.write(wb,{bookType:"xlsx",type:"array"});downloadBlob(new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),`armazen-${safeName}.xlsx`);}else{const esc=(v:unknown)=>{const s=String(v??"");return `"${s.replace(/"/g,'""')}"`;};const csv=[columns.map(esc).join(exportForm.delimiter||";"),...preview.map(r=>columns.map(c=>esc(r[c])).join(exportForm.delimiter||";"))].join("\r\n");downloadBlob(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}),`armazen-${safeName}.csv`);}if(user&&orgId){const {error}=await db.from("export_history").insert({org_id:orgId,user_id:user.id,dataset:exportForm.dataset,format:exportForm.format,record_count:preview.length,filters:{fields:selectedFields,delimiter:exportForm.delimiter},template_id:exportForm.template_id||null,template_name:exportForm.template_name||null});if(error)throw error;}notify("Arquivo gerado. A geração não significa que o ERP recebeu ou importou os dados.");refresh();}catch(e){fail(e);}})()}><Download className="h-4 w-4"/> Gerar arquivo</button><span className="text-sm text-muted-foreground">{preview.length} registro(s) na prévia</span></div>
      {preview.length>0&&<div className="mt-4"><Table headers={selectedFields} rows={preview.slice(0,10).map(row=>selectedFields.map(f=>pretty(row[f])))}/><p className="mt-2 text-xs text-muted-foreground">Exibindo até 10 linhas de prévia. O arquivo pode conter até 5.000 registros nesta versão.</p></div>}
    </Panel>
    <Panel title="Histórico de exportações" description="Auditoria das gerações de arquivo registradas no banco."><Table headers={["Data","Conjunto","Formato","Registros","Modelo","Usuário"]} rows={history.map(h=>[new Date(h.created_at).toLocaleString("pt-BR"),datasets[h.dataset]?.label??h.dataset,h.format,h.record_count,pretty(h.template_name),pretty(h.user_id)])}/></Panel>
  </div>;

  const settingsSection = <div className="space-y-5">
    <Panel title="Organização e permissões" description="Papéis: consulta, operação e gestão. A autorização real deve ser garantida também por RLS e funções do PostgreSQL.">
      <div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Organização atual</p><p className="mt-1 font-semibold">{orgName||"Não identificada"}</p></div><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Seu perfil</p><p className="mt-1 font-semibold capitalize">{role||"Não identificado"}</p></div><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Usuário autenticado</p><p className="mt-1 truncate font-semibold">{user?.email||"Sessão não identificada"}</p></div></div>
      {canManage&&<form className="mb-5 grid gap-3 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();void runSave(async()=>{const {error}=await db.rpc("add_member_by_email",{_email:memberForm.email.trim(),_org:orgId,_role:memberForm.role});if(error)throw error;setMemberForm({email:"",role:"operacao"});},"Solicitação de associação concluída.");}}><Field label="E-mail do usuário existente" value={memberForm.email} onChange={v=>setMemberForm({...memberForm,email:v})} required/><SelectField label="Papel" value={memberForm.role} onChange={v=>setMemberForm({...memberForm,role:v})} options={[{value:"consulta",label:"Consulta"},{value:"operacao",label:"Operação"},{value:"gestao",label:"Gestão"}]} required/><div className="flex items-end"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Users className="mr-2 inline h-4 w-4"/>Associar usuário</button></div></form>}
      {!canManage&&<p className="mb-4 text-sm text-muted-foreground">A associação de usuários está disponível apenas para o perfil Gestão.</p>}
      <Table headers={["Nome","E-mail","Papel","Desde"]} rows={members.map(m=>[pretty(m.profiles?.full_name),pretty(m.profiles?.email),statusPill(m.role),dateLabel(m.created_at)])}/>
    </Panel>
    <Panel title="Notas de segurança e configuração" description="O protótipo não possui um formulário de login nesta tela, conforme solicitado.">
      <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>O acesso às operações depende de uma sessão Supabase já autenticada e do vínculo com a organização.</li><li>Não é seguro desativar RLS para fazer o dashboard funcionar.</li><li>O primeiro administrador deve ser associado por procedimento seguro no backend; não use senha padrão ou chave service_role no navegador.</li><li>O repositório contém tipos TypeScript para funções transacionais, mas a existência dos tipos não comprova que as migrações estejam aplicadas ao projeto Supabase conectado.</li></ul>
    </Panel>
  </div>;

  const active = nav.find(n=>n.id===section);
  return <div className="min-h-screen bg-background text-foreground md:flex">
    <aside className="flex w-full flex-col border-b bg-[var(--sidebar)] text-[var(--sidebar-foreground)] md:fixed md:inset-y-0 md:w-64 md:border-b-0 md:border-r md:border-[var(--sidebar-border)]">
      <div className="flex items-center gap-3 border-b border-[var(--sidebar-border)] px-5 py-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Warehouse className="h-5 w-5"/></div><div><p className="text-lg font-bold">armaZen</p><p className="text-xs text-[var(--sidebar-muted)]">Sistema de gestão de armazém</p></div></div>
      <nav aria-label="Navegação principal" className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-3 md:flex md:flex-1 md:flex-col">{nav.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>{setSection(item.id);setSearch("");setMessage("");setDataError("");}} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${section===item.id?"bg-[var(--sidebar-accent)] font-semibold text-[var(--sidebar-accent-foreground)]":"text-[var(--sidebar-foreground)]/75 hover:bg-[var(--sidebar-accent)]"}`}><Icon className="h-4 w-4 shrink-0"/><span>{item.label}</span></button>;})}</nav>
      <div className="hidden border-t border-[var(--sidebar-border)] p-4 text-xs text-[var(--sidebar-muted)] md:block">Protótipo acadêmico · armaZen</div>
    </aside>
    <main className="min-w-0 flex-1 md:ml-64">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-4 sm:px-8"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Operação / {active?.label}</p><h1 className="mt-1 text-xl font-semibold">{section==="dashboard"?"Visão geral da operação":active?.label}</h1></div><div className="flex items-center gap-4"><div className="text-right"><p className="text-sm font-medium">{orgName||"Organização não identificada"}</p><p className="text-xs capitalize text-muted-foreground">{role||"Sessão / perfil não identificado"}</p></div><button onClick={()=>void supabase.auth.signOut()} className="h-9 rounded-lg border px-3 text-xs font-medium text-muted-foreground hover:bg-muted" title="Sair">Sair</button></div></header>
      <div className="space-y-4 p-5 sm:p-8">
        {message&&<div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">{message}</div>}
        {dataError&&<div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive"/><div className="flex-1">{dataError}</div><button onClick={()=>{setDataError("");refresh();}} className="font-medium underline">Tentar novamente</button></div>}
        {loading&&<p className="text-sm text-muted-foreground">Atualizando dados do Supabase…</p>}
        {section==="dashboard"&&dashboard}
        {section==="warehouse"&&warehouseSection}
        {section==="materials"&&materialsSection}
        {section==="movements"&&movementsSection}
        {section==="tasks"&&tasksSection}
        {section==="exports"&&exportsSection}
        {section==="settings"&&settingsSection}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>armaZen · Sistema de Gestão de Armazém</span><span>Exportação por arquivo; sem integração automática com ERP.</span></footer>
      </div>
    </main>
  </div>;
}

function AdjustmentForm({ orgId, materials, locations, saving, onSave, onDone }: {
  orgId: string; materials: AnyRow[]; locations: AnyRow[]; saving: boolean;
  onSave: (fn:()=>Promise<unknown>, success:string)=>Promise<void>; onDone:()=>void;
}) {
  const [form,setForm]=useState({material_id:"",location_id:"",lot:"",counted:"0",reason:""});
  return <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={e=>{e.preventDefault();void onSave(async()=>{if(!form.material_id||!form.location_id)throw new Error("Selecione material e endereço.");if(!form.reason.trim())throw new Error("Informe o motivo do ajuste.");const counted=Number(form.counted);if(!Number.isFinite(counted)||counted<0)throw new Error("A contagem precisa ser zero ou maior.");const {error}=await db.rpc("register_adjustment",{_material:form.material_id,_location:form.location_id,_lot:form.lot||"",_counted:counted,_reason:form.reason.trim(),_org:orgId});if(error)throw error;setForm({material_id:"",location_id:"",lot:"",counted:"0",reason:""});onDone();},"Ajuste de inventário registrado.");}}><SelectField label="Material" value={form.material_id} onChange={v=>setForm({...form,material_id:v})} required options={materials.filter(m=>m.status==="ativo"||m.status==="active").map(m=>({value:m.id,label:`${m.code} — ${m.description}`}))}/><SelectField label="Endereço" value={form.location_id} onChange={v=>setForm({...form,location_id:v})} required options={locations.filter(l=>l.active&&l.status!=="bloqueado").map(l=>({value:l.id,label:`${l.code} — ${l.name}`}))}/><Field label="Lote" value={form.lot} onChange={v=>setForm({...form,lot:v})}/><Field label="Quantidade contada" type="number" min={0} step={0.01} value={form.counted} onChange={v=>setForm({...form,counted:v})} required/><Field label="Motivo obrigatório" value={form.reason} onChange={v=>setForm({...form,reason:v})} required/><div className="flex items-end"><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Registrar ajuste</button></div></form>;
}
