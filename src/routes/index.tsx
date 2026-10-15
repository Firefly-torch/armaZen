import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowLeftRight, Boxes, Building2,
  CheckCircle2, ClipboardList, Download, LayoutDashboard,
  MapPinned, Package, RefreshCw, ShieldCheck, Warehouse,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export const Route = createFileRoute("/")({ component: Index });

type Section = "dashboard" | "warehouse" | "materials" | "movements" | "tasks" | "exports" | "settings";
type Metric = { label: string; value: string; note: string; icon: typeof Boxes; tone?: "warning" | "normal" };

const navigation: { id: Section; label: string; icon: typeof Boxes }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "warehouse", label: "Armazém e endereçamento", icon: Warehouse },
  { id: "materials", label: "Materiais e estoque", icon: Package },
  { id: "movements", label: "Movimentações", icon: ArrowLeftRight },
  { id: "tasks", label: "Tarefas operacionais", icon: ClipboardList },
  { id: "exports", label: "Exportação para ERP", icon: Download },
  { id: "settings", label: "Usuários e configurações", icon: ShieldCheck },
];

function Index() {
  const [user, setUser] = useState<User | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [role, setRole] = useState("");
  const [metrics, setMetrics] = useState({ materials: 0, locations: 0, units: 0, lowStock: 0, movements: 0, pending: 0, overdue: 0, divergences: 0 });
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
    }).catch(() => { /* O dashboard permanece acessível mesmo sem sessão. */ });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) { setOrgId(""); setOrgName(""); setRole(""); }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("org_id, role, organizations(name)")
        .eq("user_id", user.id);
      if (cancelled) return;
      if (error) { setDataError("Não foi possível carregar sua organização. Verifique as políticas RLS e sua associação."); return; }
      const membership = data?.[0] as { org_id: string; role: string; organizations: { name: string } | { name: string }[] | null } | undefined;
      if (!membership) { setDataError("Seu usuário ainda não está associado a uma organização. Peça à gestão para concluir a configuração inicial."); return; }
      const org = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;
      setOrgId(membership.org_id);
      setOrgName(org?.name ?? "Organização");
      setRole(membership.role);
    })().catch(() => { if (!cancelled) setDataError("Falha ao carregar a organização."); });
    return () => { cancelled = true; };
  }, [user]);

  const loadMetrics = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setDataError("");
    try {
      const [materials, locations, balances, movements, tasks, counts] = await Promise.all([
        supabase.from("materials").select("id, min_stock, status").eq("org_id", orgId),
        supabase.from("locations").select("id, status").eq("org_id", orgId).eq("active", true),
        supabase.from("inventory_balances").select("material_id, quantity").eq("org_id", orgId),
        supabase.from("stock_movements").select("id, created_at").eq("org_id", orgId).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
        supabase.from("tasks").select("id, status, due_at").eq("org_id", orgId),
        supabase.from("inventory_count_items").select("id, difference").eq("org_id", orgId),
      ]);
      const failed = [materials, locations, balances, movements, tasks, counts].find((r) => r.error);
      if (failed?.error) throw failed.error;
      const materialRows = materials.data ?? [];
      const activeMaterials = materialRows.filter((m) => m.status === "active" || m.status === "ativo");
      const totals = new Map<string, number>();
      (balances.data ?? []).forEach((b) => totals.set(b.material_id, (totals.get(b.material_id) ?? 0) + Number(b.quantity ?? 0)));
      const lowStock = activeMaterials.filter((m) => (totals.get(m.id) ?? 0) < Number(m.min_stock ?? 0)).length;
      const now = Date.now();
      const openTasks = (tasks.data ?? []).filter((t) => !["completed", "concluida", "concluída"].includes(String(t.status).toLowerCase()));
      setMetrics({
        materials: materialRows.length,
        locations: (locations.data ?? []).length,
        units: (balances.data ?? []).reduce((sum, b) => sum + Number(b.quantity ?? 0), 0),
        lowStock,
        movements: (movements.data ?? []).length,
        pending: openTasks.length,
        overdue: openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now).length,
        divergences: (counts.data ?? []).filter((c) => Number(c.difference) !== 0).length,
      });
      setLastUpdated(new Date());
    } catch {
      setDataError("Falha ao consultar dados do WMS. Confira a conexão, as tabelas do Supabase e as políticas RLS; nenhum indicador fictício foi exibido.");
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void loadMetrics(); }, [loadMetrics]);

  const cards: Metric[] = useMemo(() => [
    { label: "Materiais cadastrados", value: String(metrics.materials), note: "Registros da organização", icon: Package },
    { label: "Endereços ativos", value: String(metrics.locations), note: "Locais disponíveis no cadastro", icon: MapPinned },
    { label: "Unidades em estoque", value: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(metrics.units), note: "Soma das quantidades registradas", icon: Boxes },
    { label: "Abaixo do mínimo", value: String(metrics.lowStock), note: "Materiais que exigem atenção", icon: AlertTriangle, tone: metrics.lowStock ? "warning" : "normal" },
    { label: "Movimentações (30 dias)", value: String(metrics.movements), note: "Operações registradas no período", icon: Activity },
    { label: "Tarefas em aberto", value: String(metrics.pending), note: metrics.overdue + " atrasadas", icon: ClipboardList, tone: metrics.overdue ? "warning" : "normal" },
    { label: "Divergências de inventário", value: String(metrics.divergences), note: "Itens com diferença registrada", icon: AlertTriangle, tone: metrics.divergences ? "warning" : "normal" },
  ], [metrics]);


  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className="flex w-full flex-col border-b bg-[var(--sidebar)] text-[var(--sidebar-foreground)] md:fixed md:inset-y-0 md:w-64 md:border-b-0 md:border-r md:border-[var(--sidebar-border)]">
        <div className="flex items-center gap-3 border-b border-[var(--sidebar-border)] px-5 py-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Warehouse className="h-5 w-5" /></div><div><p className="text-lg font-bold">armaZen</p><p className="text-xs text-[var(--sidebar-muted)]">Warehouse management</p></div></div>
        <nav aria-label="Navegação principal" className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-3 md:flex md:flex-1 md:flex-col">
          {navigation.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setSection(item.id)} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${section === item.id ? "bg-[var(--sidebar-accent)] font-semibold text-[var(--sidebar-accent-foreground)]" : "text-[var(--sidebar-foreground)]/75 hover:bg-[var(--sidebar-accent)]"}`}><Icon className="h-4 w-4 shrink-0" /><span>{item.label}</span></button>; })}
        </nav>
        <div className="hidden border-t border-[var(--sidebar-border)] p-4 text-xs text-[var(--sidebar-muted)] md:block">Protótipo acadêmico · Dados da organização</div>
      </aside>
      <main className="min-w-0 flex-1 md:ml-64">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-4 sm:px-8">
          <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Operação / {navigation.find((n) => n.id === section)?.label}</p><h1 className="mt-1 text-xl font-semibold">{section === "dashboard" ? "Visão geral da operação" : navigation.find((n) => n.id === section)?.label}</h1></div>
          <div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-medium">{orgName || "Carregando organização..."}</p><p className="text-xs capitalize text-muted-foreground">{role || "Perfil não identificado"}</p></div></div>
        </header>
        <div className="p-5 sm:p-8">
          {dataError && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div className="flex-1">{dataError}</div><button onClick={() => { setDataError(""); void loadMetrics(); }} className="font-medium underline">Tentar novamente</button></div>}
          {section === "dashboard" ? <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold">Indicadores operacionais</h2><p className="mt-1 text-sm text-muted-foreground">Valores consultados do Supabase; sem números demonstrativos fixos.</p></div><button onClick={() => void loadMetrics()} disabled={loading || !orgId} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</button></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map((card) => { const Icon = card.icon; return <article key={card.label} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{card.label}</p><span className={`rounded-lg p-2 ${card.tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-muted text-foreground"}`}><Icon className="h-4 w-4" /></span></div><p className="mt-4 text-3xl font-semibold tracking-tight">{!orgId || loading ? "—" : card.value}</p><p className="mt-2 text-xs text-muted-foreground">{card.note}</p></article>; })}</div>
            <section className="mt-6 rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-muted-foreground" /><h2 className="font-semibold">Estado da conexão</h2></div><p className="mt-2 text-sm text-muted-foreground">{orgId ? "Organização identificada. Os indicadores refletem os registros disponíveis para consulta." : "Nenhuma organização foi identificada. Para carregar dados reais, configure o acesso ao Supabase e a associação da organização."}</p>{lastUpdated && <p className="mt-2 text-xs text-muted-foreground">Última consulta: {lastUpdated.toLocaleString("pt-BR")}</p>}</section>
          </> : <section className="rounded-xl border bg-card p-6 sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted"><Building2 className="h-6 w-6" /></div><h2 className="mt-4 text-lg font-semibold">Módulo em revisão</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">A navegação está preparada, mas este módulo ainda precisa de telas e fluxos CRUD integrados ao Supabase. Não há dados de exemplo apresentados como se fossem reais. A lista de lacunas e a sequência de implementação estão documentadas no repositório.</p><div className="mt-5 flex flex-wrap gap-3"><button onClick={() => setSection("dashboard")} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Voltar ao dashboard</button>{section === "exports" && <span className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground"><ArrowDownToLine className="h-4 w-4" /> CSV, XLSX e JSON ainda precisam ser implementados</span>}</div></section>}
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground"><span>armaZen · Sistema de Gestão de Armazém</span><span>Dados demonstrativos não são tratados como dados reais.</span></footer>
        </div>
      </main>
    </div>
  );
}
