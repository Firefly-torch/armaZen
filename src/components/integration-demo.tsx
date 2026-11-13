import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Boxes,
  Cable,
  CalendarClock,
  ClipboardCheck,
  Database,
  GitBranch,
  Layers3,
  MapPin,
  Package,
  RefreshCw,
  Warehouse,
} from "lucide-react";

type DataRow = Record<string, any>;

type Props = {
  materials: DataRow[];
  balances: DataRow[];
  movements: DataRow[];
  locations: DataRow[];
  warehouses: DataRow[];
  inventoryItems: DataRow[];
  exportHistory: DataRow[];
  auditLogs: DataRow[];
  orgName: string;
};

type TabId = "overview" | "mapping" | "flows" | "data";

const formatNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(number)
    : "—";
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
};

const movementLabels: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia: "Transferência",
  ajuste: "Ajuste",
  estorno: "Estorno",
};

const datasetLabels: Record<string, string> = {
  materials: "Materiais",
  balances: "Saldos de estoque",
  locations: "Endereços",
  movements: "Movimentações",
  counts: "Inventário",
  tasks: "Tarefas",
};

function MetricCard({ label, value, detail, icon: Icon }: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SectionCard({ title, description, children, action }: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DataTable({ headers, rows, empty = "Nenhum registro disponível." }: {
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  if (!rows.length) {
    return <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
          <tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-3 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, index) => (
            <tr key={index} className="odd:bg-background even:bg-muted/20">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-[22rem] px-3 py-3 align-middle break-words">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatePill({ value, tone = "neutral" }: { value: string; tone?: "neutral" | "success" | "warning" }) {
  const classes = tone === "success"
    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
    : tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      : "border-border bg-muted text-muted-foreground";
  return <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-medium " + classes}>{value}</span>;
}

function FlowCard({ direction, title, description, items, icon: Icon }: {
  direction: string;
  title: string;
  description: string;
  items: Array<{ label: string; count: number; detail: string }>;
  icon: typeof ArrowDownLeft;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5"/></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{direction}</p>
          <h3 className="mt-1 font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4 divide-y rounded-lg border">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
            <p className="shrink-0 text-lg font-semibold tabular-nums">{formatNumber(item.count)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function IntegrationDemo({
  materials,
  balances,
  movements,
  locations,
  warehouses,
  inventoryItems,
  exportHistory,
  auditLogs,
  orgName,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const activeMaterials = materials.filter((material) => material.status === "ativo" || material.status === "active");
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.active !== false);
  const activeLocations = locations.filter((location) => location.active !== false);
  const positiveBalances = balances.filter((balance) => Number(balance.quantity) > 0);

  const materialById = useMemo(() => new Map(materials.map((material) => [String(material.id), material])), [materials]);
  const locationById = useMemo(() => new Map(locations.map((location) => [String(location.id), location])), [locations]);
  const warehouseById = useMemo(() => new Map(warehouses.map((warehouse) => [String(warehouse.id), warehouse])), [warehouses]);

  const recentMovements = useMemo(
    () => [...movements].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()).slice(0, 8),
    [movements],
  );
  const recentExports = useMemo(
    () => [...exportHistory].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()).slice(0, 6),
    [exportHistory],
  );
  const recentAudit = useMemo(
    () => [...auditLogs].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()).slice(0, 6),
    [auditLogs],
  );

  const activity = useMemo(() => {
    const movementEvents = recentMovements.map((movement) => {
      const material = materialById.get(String(movement.material_id));
      const from = locationById.get(String(movement.from_location_id));
      const to = locationById.get(String(movement.to_location_id));
      return {
        id: "movement-" + movement.id,
        time: movement.created_at,
        source: "Movimentação",
        title: movementLabels[String(movement.type)] ?? String(movement.type),
        detail: [
          material?.code ?? "Material",
          formatNumber(movement.quantity) + (material?.unit ? " " + material.unit : ""),
          from?.code ? "Origem " + from.code : "",
          to?.code ? "Destino " + to.code : "",
        ].filter(Boolean).join(" · "),
      };
    });
    const exportEvents = recentExports.map((item) => ({
      id: "export-" + item.id,
      time: item.created_at,
      source: "Exportação",
      title: "Arquivo " + String(item.format ?? "").toUpperCase() + " gerado",
      detail: (datasetLabels[String(item.dataset)] ?? String(item.dataset)) + " · " + formatNumber(item.record_count) + " registro(s)",
    }));
    const auditEvents = recentAudit.map((item) => ({
      id: "audit-" + item.id,
      time: item.created_at,
      source: "Auditoria",
      title: String(item.action ?? "Alteração") + " · " + String(item.entity ?? "registro"),
      detail: item.entity_id ? "Registro " + item.entity_id : "Evento registrado no armaZen",
    }));
    return [...movementEvents, ...exportEvents, ...auditEvents]
      .sort((a, b) => new Date(b.time ?? 0).getTime() - new Date(a.time ?? 0).getTime())
      .slice(0, 10);
  }, [recentMovements, recentExports, recentAudit, materialById, locationById]);

  const mappingRows = [
    { group: "Materiais", direction: "ERP → armaZen", erp: "CODPROD", wms: "materials.code", count: materials.length, description: "Identificador do material" },
    { group: "Materiais", direction: "ERP → armaZen", erp: "DESCRICAO", wms: "materials.description", count: materials.length, description: "Descrição comercial/técnica" },
    { group: "Materiais", direction: "ERP → armaZen", erp: "GRUPO", wms: "materials.category", count: materials.length, description: "Categoria do material" },
    { group: "Materiais", direction: "ERP → armaZen", erp: "UNIDADE", wms: "materials.unit", count: materials.length, description: "Unidade de medida" },
    { group: "Materiais", direction: "ERP → armaZen", erp: "CODBARRA", wms: "materials.barcode", count: materials.length, description: "Código de barras" },
    { group: "Materiais", direction: "ERP → armaZen", erp: "ESTOQUE_MIN", wms: "materials.min_stock", count: materials.length, description: "Estoque mínimo" },
    { group: "Armazéns", direction: "ERP → armaZen", erp: "CODARMAZEM", wms: "warehouses.code", count: warehouses.length, description: "Identificador do armazém" },
    { group: "Armazéns", direction: "ERP → armaZen", erp: "DESCRARMAZEM", wms: "warehouses.name", count: warehouses.length, description: "Nome do armazém" },
    { group: "Endereços", direction: "ERP → armaZen", erp: "CODLOCAL", wms: "locations.code", count: locations.length, description: "Código do endereço" },
    { group: "Endereços", direction: "ERP → armaZen", erp: "DESCRLOCAL", wms: "locations.name", count: locations.length, description: "Descrição do endereço" },
    { group: "Endereços", direction: "ERP → armaZen", erp: "LOCAL_PAI", wms: "locations.parent_id", count: locations.length, description: "Relacionamento hierárquico" },
    { group: "Endereços", direction: "ERP → armaZen", erp: "STATUS_LOCAL", wms: "locations.status", count: locations.length, description: "Situação operacional" },
    { group: "Saldos", direction: "armaZen → ERP", erp: "CODPROD", wms: "inventory_balances.material_id", count: balances.length, description: "Material vinculado ao saldo" },
    { group: "Saldos", direction: "armaZen → ERP", erp: "CODLOCAL", wms: "inventory_balances.location_id", count: balances.length, description: "Endereço vinculado ao saldo" },
    { group: "Saldos", direction: "armaZen → ERP", erp: "LOTE", wms: "inventory_balances.lot", count: balances.length, description: "Identificação do lote" },
    { group: "Saldos", direction: "armaZen → ERP", erp: "VALIDADE", wms: "inventory_balances.expiry_date", count: balances.length, description: "Data de validade, quando cadastrada" },
    { group: "Saldos", direction: "armaZen → ERP", erp: "QUANTIDADE", wms: "inventory_balances.quantity", count: balances.length, description: "Saldo por material, endereço e lote" },
    { group: "Movimentações", direction: "armaZen → ERP", erp: "NUMMOV", wms: "stock_movements.number", count: movements.length, description: "Número do lançamento" },
    { group: "Movimentações", direction: "armaZen → ERP", erp: "TIPOMOV", wms: "stock_movements.type", count: movements.length, description: "Entrada, saída, transferência ou ajuste" },
    { group: "Movimentações", direction: "armaZen → ERP", erp: "CODPROD", wms: "stock_movements.material_id", count: movements.length, description: "Material movimentado" },
    { group: "Movimentações", direction: "armaZen → ERP", erp: "QUANTIDADE", wms: "stock_movements.quantity", count: movements.length, description: "Quantidade da operação" },
    { group: "Movimentações", direction: "armaZen → ERP", erp: "LOCAL_ORIGEM", wms: "stock_movements.from_location_id", count: movements.length, description: "Endereço de origem" },
    { group: "Movimentações", direction: "armaZen → ERP", erp: "LOCAL_DESTINO", wms: "stock_movements.to_location_id", count: movements.length, description: "Endereço de destino" },
    { group: "Movimentações", direction: "armaZen → ERP", erp: "LOTE", wms: "stock_movements.lot", count: movements.length, description: "Lote movimentado" },
    { group: "Movimentações", direction: "armaZen → ERP", erp: "DATAHORA", wms: "stock_movements.created_at", count: movements.length, description: "Data e hora do lançamento" },
    { group: "Inventário", direction: "armaZen → ERP", erp: "CODPROD", wms: "inventory_count_items.material_id", count: inventoryItems.length, description: "Material contado" },
    { group: "Inventário", direction: "armaZen → ERP", erp: "CODLOCAL", wms: "inventory_count_items.location_id", count: inventoryItems.length, description: "Posição contada" },
    { group: "Inventário", direction: "armaZen → ERP", erp: "QTD_ESPERADA", wms: "inventory_count_items.expected_qty", count: inventoryItems.length, description: "Saldo antes da contagem" },
    { group: "Inventário", direction: "armaZen → ERP", erp: "QTD_CONTADA", wms: "inventory_count_items.counted_qty", count: inventoryItems.length, description: "Quantidade física apurada" },
    { group: "Inventário", direction: "armaZen → ERP", erp: "DIFERENCA", wms: "inventory_count_items.difference", count: inventoryItems.length, description: "Diferença entre físico e sistema" },
  ];

  const dataRows = materials.map((material) => {
    const materialBalances = balances.filter((balance) => String(balance.material_id) === String(material.id));
    const balanceTotal = materialBalances.reduce((total, balance) => total + Number(balance.quantity ?? 0), 0);
    return [
      <span className="font-mono text-xs font-semibold">{material.code}</span>,
      material.description,
      material.category ?? "—",
      material.unit ?? "—",
      formatNumber(material.min_stock),
      <span className="font-semibold tabular-nums">{formatNumber(balanceTotal)} {material.unit ?? ""}</span>,
      <StatePill value={material.status === "ativo" || material.status === "active" ? "Ativo" : "Inativo"} tone={material.status === "ativo" || material.status === "active" ? "success" : "neutral"}/>,
    ];
  });

  const balanceRows = balances.map((balance) => {
    const material = materialById.get(String(balance.material_id));
    const location = locationById.get(String(balance.location_id));
    const warehouse = location ? warehouseById.get(String(location.warehouse_id)) : undefined;
    return [
      material?.code ?? "Material não localizado",
      location?.code ?? "Endereço não localizado",
      warehouse?.code ?? "—",
      balance.lot || "Sem lote",
      balance.expiry_date ? formatDate(balance.expiry_date) : "—",
      <span className="font-semibold tabular-nums">{formatNumber(balance.quantity)} {material?.unit ?? ""}</span>,
      formatDate(balance.updated_at),
    ];
  });

  const movementRows = [...movements].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()).map((movement) => {
    const material = materialById.get(String(movement.material_id));
    const from = locationById.get(String(movement.from_location_id));
    const to = locationById.get(String(movement.to_location_id));
    return [
      <span className="font-mono text-xs">{movement.number ?? String(movement.id).slice(0, 8)}</span>,
      formatDate(movement.created_at),
      movementLabels[String(movement.type)] ?? movement.type,
      material?.code ?? "—",
      <span className="tabular-nums">{formatNumber(movement.quantity)} {material?.unit ?? ""}</span>,
      from?.code ?? "—",
      to?.code ?? "—",
      movement.lot || "—",
      movement.reference ?? movement.reason ?? "—",
    ];
  });

  const inventoryRows = inventoryItems.map((item) => {
    const material = materialById.get(String(item.material_id));
    const location = locationById.get(String(item.location_id));
    const difference = Number(item.difference ?? 0);
    return [
      material?.code ?? "—",
      location?.code ?? "—",
      item.lot || "—",
      formatNumber(item.expected_qty),
      formatNumber(item.counted_qty),
      <span className={"font-semibold tabular-nums " + (difference === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{difference > 0 ? "+" : ""}{formatNumber(difference)}</span>,
      item.reason ?? "—",
      formatDate(item.created_at),
    ];
  });

  const tabs: Array<{ id: TabId; label: string; icon: typeof Activity }> = [
    { id: "overview", label: "Visão geral", icon: Activity },
    { id: "mapping", label: "Mapeamento", icon: GitBranch },
    { id: "flows", label: "Fluxos de dados", icon: ArrowLeftRight },
    { id: "data", label: "Dados e histórico", icon: Database },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary"><Cable className="h-6 w-6"/></div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Conectividade empresarial</p>
              <h2 className="mt-1 text-xl font-semibold">Integração com ERP</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Visão consolidada dos dados do armaZen e da estrutura prevista para intercâmbio com o sistema de gestão empresarial.
              </p>
            </div>
          </div>
          <StatePill value="Aguardando homologação técnica"/>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Sistema de destino", "ERP corporativo"],
            ["Protocolo previsto", "API REST · JSON"],
            ["Autenticação", "OAuth 2.0 / Token"],
            ["Direção de dados", "Bidirecional"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5"/> Organização: <strong className="font-medium text-foreground">{orgName || "Organização atual"}</strong></span>
          <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5"/> Última atividade: {activity[0]?.time ? formatDate(activity[0].time) : "Sem atividade registrada"}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Materiais cadastrados" value={materials.length} detail={formatNumber(activeMaterials.length) + " ativos"} icon={Package}/>
        <MetricCard label="Armazéns ativos" value={activeWarehouses.length} detail={warehouses.length + " cadastrados"} icon={Warehouse}/>
        <MetricCard label="Endereços ativos" value={activeLocations.length} detail={locations.length + " posições/estruturas"} icon={MapPin}/>
        <MetricCard label="Saldos registrados" value={positiveBalances.length} detail={balances.length + " linhas de saldo"} icon={Boxes}/>
        <MetricCard label="Movimentações" value={movements.length} detail="Lançamentos no histórico operacional" icon={ArrowLeftRight}/>
        <MetricCard label="Itens de inventário" value={inventoryItems.length} detail="Registros de contagem e divergência" icon={ClipboardCheck}/>
      </div>

      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-muted/30 p-1" role="tablist" aria-label="Seções de integração ERP">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={"flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors " + (selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="h-4 w-4"/>{tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <FlowCard
              direction="ERP → armaZen"
              title="Dados recebidos do ERP"
              description="Cadastros e referências que alimentam a estrutura operacional do WMS."
              icon={ArrowDownLeft}
              items={[
                { label: "Cadastro de materiais", count: materials.length, detail: "Código, descrição, categoria e unidade" },
                { label: "Armazéns", count: warehouses.length, detail: "Identificação e estrutura organizacional" },
                { label: "Endereços", count: locations.length, detail: "Hierarquia e situação dos locais" },
              ]}
            />
            <FlowCard
              direction="armaZen → ERP"
              title="Dados enviados ao ERP"
              description="Registros operacionais que podem retornar ao sistema corporativo."
              icon={ArrowUpRight}
              items={[
                { label: "Saldos de estoque", count: balances.length, detail: "Material, endereço, lote e quantidade" },
                { label: "Movimentações", count: movements.length, detail: "Entradas, saídas, transferências e ajustes" },
                { label: "Contagens de inventário", count: inventoryItems.length, detail: "Quantidades esperadas, contadas e diferenças" },
              ]}
            />
          </div>
          <SectionCard title="Atividade recente" description="Eventos operacionais e arquivos gerados a partir dos registros desta organização.">
            {activity.length ? (
              <div className="divide-y">
                {activity.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="mt-0.5 rounded-lg bg-muted p-2"><Activity className="h-4 w-4 text-muted-foreground"/></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{item.title}</p>
                        <StatePill value={item.source}/>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">{formatDate(item.time)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">As atividades aparecerão aqui conforme materiais, movimentações e exportações forem registrados.</div>
            )}
          </SectionCard>
        </div>
      )}

      {activeTab === "mapping" && (
        <div className="space-y-4">
          <SectionCard title="Dicionário de integração" description="Correspondência entre os campos de negócio do ERP e as entidades armazenadas no armaZen." action={<StatePill value={mappingRows.length + " campos mapeados"} tone="success"/>}>
            <div className="space-y-5">
              {Array.from(new Set(mappingRows.map((row) => row.group))).map((group) => {
                const rows = mappingRows.filter((row) => row.group === group);
                return (
                  <div key={group}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold">{group}</h4>
                      <span className="text-xs text-muted-foreground">{rows[0]?.direction}</span>
                    </div>
                    <DataTable
                      headers={["Campo ERP", "Campo armaZen", "Finalidade", "Registros de origem"]}
                      rows={rows.map((row) => [
                        <span className="font-mono text-xs font-semibold">{row.erp}</span>,
                        <span className="font-mono text-xs">{row.wms}</span>,
                        row.description,
                        formatNumber(row.count),
                      ])}
                    />
                  </div>
                );
              })}
            </div>
          </SectionCard>
          <SectionCard title="Regras de conversão" description="Critérios necessários para manter os cadastros e as referências consistentes entre os sistemas.">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["Identificadores", "Códigos de materiais, armazéns e endereços são usados como referências de negócio; UUIDs permanecem internos."],
                ["Unidades de medida", "A quantidade deve preservar a unidade cadastrada para o material. Não se somam quantidades de unidades diferentes."],
                ["Lotes e validade", "Lote e validade acompanham o saldo por posição, quando essas informações estiverem cadastradas."],
                ["Movimentações", "Cada lançamento mantém tipo, quantidade, origem, destino, lote, referência e data/hora."],
                ["Inventário", "O resultado deve manter quantidade esperada, quantidade contada, diferença e justificativa."],
                ["Atualização", "A integração deve reconhecer alterações e evitar processar duas vezes o mesmo evento."],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-lg border p-3">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {activeTab === "flows" && (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <FlowCard
              direction="Entrada de dados"
              title="ERP → armaZen"
              description="Informações corporativas utilizadas para organizar a operação física."
              icon={ArrowDownLeft}
              items={[
                { label: "Materiais", count: materials.length, detail: "Cadastro, categoria e unidade de medida" },
                { label: "Armazéns", count: warehouses.length, detail: "Unidades e locais de estoque" },
                { label: "Endereços", count: locations.length, detail: "Códigos, hierarquia e status" },
              ]}
            />
            <FlowCard
              direction="Retorno operacional"
              title="armaZen → ERP"
              description="Resultados da execução física e atualização dos registros de estoque."
              icon={ArrowUpRight}
              items={[
                { label: "Saldos", count: balances.length, detail: "Quantidade por material, posição e lote" },
                { label: "Movimentações", count: movements.length, detail: "Histórico de operações logísticas" },
                { label: "Inventário", count: inventoryItems.length, detail: "Conferências e divergências encontradas" },
              ]}
            />
          </div>
          <SectionCard title="Sequência de processamento" description="Etapas previstas para a troca de informações entre ERP e WMS.">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["01", "Receber", "Consultar dados, documentos e cadastros disponibilizados pelo ERP."],
                ["02", "Converter", "Relacionar códigos e campos ao modelo de dados do armaZen."],
                ["03", "Validar", "Conferir unidades, referências, quantidades e regras de negócio."],
                ["04", "Retornar", "Enviar confirmações, movimentações e resultados de inventário."],
              ].map(([number, title, detail], index) => (
                <div key={number} className="relative rounded-lg border p-3">
                  <span className="text-xs font-bold tracking-wider text-primary">{number}</span>
                  <p className="mt-2 font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                  {index < 3 && <div className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border bg-background p-1 md:block"><ArrowLeftRight className="h-3 w-3 text-muted-foreground"/></div>}
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Origem dos dados no armaZen" description="Volumes atualmente disponíveis para compor os fluxos de integração.">
            <DataTable
              headers={["Conjunto", "Tabela de origem", "Registros", "Direção"]}
              rows={[
                ["Cadastro de materiais", "materials", materials.length, "ERP → armaZen"],
                ["Estrutura de armazéns", "warehouses / locations", warehouses.length + " armazéns · " + locations.length + " endereços", "ERP ↔ armaZen"],
                ["Saldos", "inventory_balances", balances.length, "armaZen → ERP"],
                ["Movimentações", "stock_movements", movements.length, "armaZen → ERP"],
                ["Contagens", "inventory_count_items", inventoryItems.length, "armaZen → ERP"],
              ]}
            />
          </SectionCard>
        </div>
      )}

      {activeTab === "data" && (
        <div className="space-y-4">
          <SectionCard title="Cadastro de materiais" description={"Dados reais cadastrados nesta organização · " + materials.length + " material(is) no conjunto carregado."}>
            <DataTable
              headers={["Código", "Descrição", "Categoria", "Unidade", "Estoque mínimo", "Saldo atual", "Situação"]}
              rows={dataRows}
              empty="Nenhum material cadastrado nesta organização."
            />
          </SectionCard>
          <SectionCard title="Posição atual dos estoques" description={"Saldos detalhados por material, endereço e lote · " + balances.length + " linha(s) carregada(s)."}>
            <DataTable
              headers={["Material", "Endereço", "Armazém", "Lote", "Validade", "Quantidade", "Atualizado em"]}
              rows={balanceRows}
              empty="Nenhum saldo de estoque encontrado."
            />
          </SectionCard>
          <SectionCard title="Movimentações recentes" description="Últimos lançamentos registrados no histórico operacional.">
            <DataTable
              headers={["Nº", "Data", "Tipo", "Material", "Quantidade", "Origem", "Destino", "Lote", "Referência"]}
              rows={movementRows}
              empty="Nenhuma movimentação registrada."
            />
          </SectionCard>
          <SectionCard title="Resultados de inventário" description={"Conferências físicas disponíveis para retorno ao ERP · " + inventoryItems.length + " item(ns) registrado(s)."}>
            <DataTable
              headers={["Material", "Endereço", "Lote", "Esperado", "Contado", "Diferença", "Justificativa", "Data"]}
              rows={inventoryRows}
              empty="Nenhum item de inventário encontrado."
            />
          </SectionCard>
          <SectionCard title="Arquivos exportados" description="Histórico do módulo Exportação para ERP, utilizado como trilha de atividades da organização.">
            <DataTable
              headers={["Data", "Conjunto", "Formato", "Registros", "Modelo"]}
              rows={[...exportHistory].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()).map((item) => [
                formatDate(item.created_at),
                datasetLabels[String(item.dataset)] ?? item.dataset,
                String(item.format ?? "").toUpperCase(),
                formatNumber(item.record_count),
                item.template_name ?? "Sem modelo",
              ])}
              empty="Nenhuma exportação registrada."
            />
          </SectionCard>
          <SectionCard title="Rastreabilidade" description="Eventos recentes de auditoria registrados no armaZen.">
            <DataTable
              headers={["Data", "Ação", "Entidade", "Identificador"]}
              rows={[...auditLogs].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()).map((item) => [
                formatDate(item.created_at),
                item.action ?? "—",
                item.entity ?? "—",
                item.entity_id ?? "—",
              ])}
              empty="Nenhum evento de auditoria disponível."
            />
          </SectionCard>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Layers3 className="h-3.5 w-3.5"/> Dados derivados dos módulos operacionais do armaZen.</span>
        <span className="inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5"/> Conector sujeito à configuração e homologação do ERP.</span>
      </div>
    </div>
  );
}
