import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  History,
  Link2,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Wifi,
} from "lucide-react";

type MaterialRow = {
  id: string;
  code: string;
  description: string;
  category?: string | null;
  unit?: string | null;
  barcode?: string | null;
  min_stock?: number | string | null;
};

type MovementRow = {
  id: string;
  number?: number | string | null;
  type: string;
  material_id: string;
  quantity: number | string;
  from_location_id?: string | null;
  to_location_id?: string | null;
  created_at?: string | null;
  reference?: string | null;
  notes?: string | null;
  lot?: string | null;
};

type LocationRow = { id: string; code: string; name: string };

type Props = {
  materials: MaterialRow[];
  movements: MovementRow[];
  locations: LocationRow[];
  orgName: string;
};

type IntegrationTab = "connection" | "mapping" | "sync" | "history";
type RunStatus = "success" | "failed";
type Direction = "inbound" | "outbound";

type DemoRun = {
  id: string;
  direction: Direction;
  label: string;
  status: RunStatus;
  createdAt: string;
  records: number;
  attempts: number;
  message: string;
  payload: Array<Record<string, string>>;
};

type ImportedDemoMaterial = {
  code: string;
  description: string;
  category: string;
  unit: string;
  barcode: string;
  min_stock: string;
};

const ERP_MATERIALS = [
  { CODPROD: "MP-ERP-001", DESCPROD: "Chapa de aço carbono", GRUPO: "Matéria-prima", UNIDADE: "KG", CODBARRA: "7891000000011", ESTOQUE_MIN: "150" },
  { CODPROD: "MP-ERP-002", DESCPROD: "Parafuso sextavado M12", GRUPO: "Fixação", UNIDADE: "UN", CODBARRA: "7891000000028", ESTOQUE_MIN: "500" },
  { CODPROD: "MP-ERP-003", DESCPROD: "Tubo PVC industrial 50 mm", GRUPO: "Tubulação", UNIDADE: "M", CODBARRA: "7891000000035", ESTOQUE_MIN: "80" },
];

const ERP_FIELDS = ["CODPROD", "DESCPROD", "GRUPO", "UNIDADE", "CODBARRA", "ESTOQUE_MIN"] as const;
type WmsField = keyof ImportedDemoMaterial;

const INITIAL_MAPPING: Record<WmsField, string> = {
  code: "CODPROD",
  description: "DESCPROD",
  category: "GRUPO",
  unit: "UNIDADE",
  barcode: "CODBARRA",
  min_stock: "ESTOQUE_MIN",
};

const STORAGE_KEY = "armaZen.erpIntegrationDemo.v1";

const dateTimeLabel = (value?: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "—";
const statusClass = (status: RunStatus) => status === "success"
  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
  : "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200";

function StatusLabel({ status }: { status: RunStatus }) {
  return (
    <span className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold " + statusClass(status)}>
      {status === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
      {status === "success" ? "Concluído" : "Falha"}
    </span>
  );
}

function StatCard({ label, value, detail, icon: Icon }: {
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

export function IntegrationDemo({ materials, movements, locations, orgName }: Props) {
  const [activeTab, setActiveTab] = useState<IntegrationTab>("connection");
  const [connectionStatus, setConnectionStatus] = useState<"not-tested" | "testing" | "connected">("not-tested");
  const [mapping, setMapping] = useState<Record<WmsField, string>>(INITIAL_MAPPING);
  const [runs, setRuns] = useState<DemoRun[]>([]);
  const [importedMaterials, setImportedMaterials] = useState<ImportedDemoMaterial[]>([]);
  const [forceNextFailure, setForceNextFailure] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          mapping?: Record<WmsField, string>;
          runs?: DemoRun[];
          importedMaterials?: ImportedDemoMaterial[];
        };
        if (saved.mapping) setMapping({ ...INITIAL_MAPPING, ...saved.mapping });
        if (Array.isArray(saved.runs)) setRuns(saved.runs);
        if (Array.isArray(saved.importedMaterials)) setImportedMaterials(saved.importedMaterials);
      }
    } catch {
      // A demonstração continua funcionando mesmo quando o armazenamento do navegador não está disponível.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ mapping, runs, importedMaterials }));
    } catch {
      // O histórico é demonstrativo; não bloquear a operação da tela por falta de sessionStorage.
    }
  }, [hydrated, mapping, runs, importedMaterials]);

  const mappedPreview = useMemo(() => ERP_MATERIALS.map((row) => ({
    code: row[mapping.code as keyof typeof row] ?? "",
    description: row[mapping.description as keyof typeof row] ?? "",
    category: row[mapping.category as keyof typeof row] ?? "",
    unit: row[mapping.unit as keyof typeof row] ?? "",
    barcode: row[mapping.barcode as keyof typeof row] ?? "",
    min_stock: row[mapping.min_stock as keyof typeof row] ?? "",
  })), [mapping]);

  const missingMappedValues = mappedPreview.filter((row) => !row.code.trim() || !row.description.trim() || !row.unit.trim()).length;

  const outboundPreview = useMemo(() => {
    const recent = [...movements]
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, 5);
    if (recent.length) {
      return recent.map((movement) => {
        const material = materials.find((item) => item.id === movement.material_id);
        const from = locations.find((item) => item.id === movement.from_location_id);
        const to = locations.find((item) => item.id === movement.to_location_id);
        return {
          id: movement.id,
          number: String(movement.number ?? movement.id.slice(0, 8)),
          type: movement.type,
          material: material ? material.code + " — " + material.description : "Material não localizado",
          quantity: String(movement.quantity),
          origin: from?.code ?? "",
          destination: to?.code ?? "",
          lot: movement.lot ?? "",
          date: dateTimeLabel(movement.created_at),
        };
      });
    }
    return [
      { id: "sample-move-1", number: "DEMO-001", type: "entrada", material: "MP-ERP-001 — Chapa de aço carbono", quantity: "120", origin: "", destination: "A-01-01", lot: "LOTE-DEMO-01", date: "Exemplo fictício" },
      { id: "sample-move-2", number: "DEMO-002", type: "transferencia", material: "MP-ERP-002 — Parafuso sextavado M12", quantity: "80", origin: "A-01-01", destination: "A-02-03", lot: "LOTE-DEMO-02", date: "Exemplo fictício" },
      { id: "sample-move-3", number: "DEMO-003", type: "saida", material: "MP-ERP-003 — Tubo PVC industrial 50 mm", quantity: "15", origin: "B-01-02", destination: "", lot: "LOTE-DEMO-03", date: "Exemplo fictício" },
    ];
  }, [movements, materials, locations]);

  const successfulRuns = runs.filter((run) => run.status === "success").length;
  const failedRuns = runs.filter((run) => run.status === "failed").length;

  const testConnection = async () => {
    setConnectionStatus("testing");
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    setConnectionStatus("connected");
  };

  const executeImport = () => {
    const duplicates = mappedPreview.filter((row) => importedMaterials.some((item) => item.code === row.code)).length;
    const accepted = mappedPreview.filter((row) => row.code.trim() && row.description.trim() && row.unit.trim())
      .filter((row) => !importedMaterials.some((item) => item.code === row.code));
    const imported = accepted.map((row) => ({
      code: row.code,
      description: row.description,
      category: row.category,
      unit: row.unit,
      barcode: row.barcode,
      min_stock: row.min_stock,
    }));
    setImportedMaterials((current) => [...current, ...imported]);
    const status: RunStatus = accepted.length ? "success" : "failed";
    const message = accepted.length
      ? accepted.length + " registro(s) importado(s) no ambiente fictício do conector." + (duplicates ? " " + duplicates + " duplicado(s) ignorado(s)." : "")
      : "Nenhum registro novo foi importado. Confira o mapeamento ou os códigos duplicados.";
    const run: DemoRun = {
      id: "IN-" + Date.now(),
      direction: "inbound",
      label: "Cadastro de materiais",
      status,
      createdAt: new Date().toISOString(),
      records: accepted.length,
      attempts: 1,
      message,
      payload: accepted.map((row) => ({ codigo: row.code, descricao: row.description, categoria: row.category, unidade: row.unit, codigo_barras: row.barcode, estoque_minimo: row.min_stock })),
    };
    setRuns((current) => [run, ...current]);
    setActiveTab("history");
  };

  const executeOutbound = () => {
    const payload = outboundPreview.map((row) => ({
      numero_movimentacao: row.number,
      tipo: row.type,
      material: row.material,
      quantidade: row.quantity,
      endereco_origem: row.origin,
      endereco_destino: row.destination,
      lote: row.lot,
      data: row.date,
    }));
    const failed = forceNextFailure;
    setForceNextFailure(false);
    const run: DemoRun = {
      id: "OUT-" + Date.now(),
      direction: "outbound",
      label: "Movimentações de estoque",
      status: failed ? "failed" : "success",
      createdAt: new Date().toISOString(),
      records: payload.length,
      attempts: 1,
      message: failed
        ? "Falha simulada: o ERP demonstrativo recusou o envio. Os dados foram mantidos na fila para reprocessamento."
        : "O ERP demonstrativo aceitou o lote e retornou confirmação para os registros enviados.",
      payload,
    };
    setRuns((current) => [run, ...current]);
    setActiveTab("history");
  };

  const retryRun = (runId: string) => {
    setRuns((current) => current.map((run) => run.id === runId
      ? {
          ...run,
          status: "success",
          attempts: run.attempts + 1,
          createdAt: new Date().toISOString(),
          message: "Reprocessamento demonstrativo concluído. O ERP fictício confirmou o recebimento do lote.",
        }
      : run));
  };

  const resetDemo = () => {
    setRuns([]);
    setImportedMaterials([]);
    setMapping(INITIAL_MAPPING);
    setConnectionStatus("not-tested");
    setForceNextFailure(false);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nada a fazer: a limpeza em memória já foi concluída.
    }
  };

  const tabs: Array<{ id: IntegrationTab; label: string; icon: typeof PlugZap }> = [
    { id: "connection", label: "Conexão", icon: PlugZap },
    { id: "mapping", label: "Mapeamento", icon: Settings2 },
    { id: "sync", label: "Sincronização", icon: RefreshCw },
    { id: "history", label: "Histórico", icon: History },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-indigo-300/60 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-xl bg-indigo-100 p-3 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200">
              <Link2 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-200">Ambiente demonstrativo</p>
              <h2 className="mt-1 text-lg font-semibold">Integrações ERP</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Experimente o fluxo de comunicação entre o armaZen e um ERP fictício. Nenhuma API externa é chamada e nenhum saldo operacional é alterado.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200">
            <Activity className="h-3.5 w-3.5" /> Simulação local
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Conexão" value={connectionStatus === "connected" ? "Ativa" : "Não testada"} detail="Resultado simulado nesta sessão" icon={Wifi} />
        <StatCard label="Operações concluídas" value={successfulRuns} detail="Lotes aceitos pelo ERP fictício" icon={CheckCircle2} />
        <StatCard label="Operações com falha" value={failedRuns} detail="Lotes disponíveis para reprocessar" icon={CircleAlert} />
      </div>

      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-muted/30 p-1" role="tablist" aria-label="Seções das integrações">
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
              <Icon className="h-4 w-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "connection" && (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border bg-muted p-3"><Database className="h-6 w-6" /></div>
                <div>
                  <h3 className="font-semibold">ERP demonstrativo</h3>
                  <p className="text-xs text-muted-foreground">Conector de referência · API simulada</p>
                </div>
              </div>
              <span className={"rounded-full border px-2.5 py-1 text-xs font-semibold " + (connectionStatus === "connected" ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-slate-300 bg-muted text-muted-foreground")}>
                {connectionStatus === "testing" ? "Testando..." : connectionStatus === "connected" ? "Conectado · simulado" : "Aguardando teste"}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Ambiente</p>
                <p className="mt-1 font-medium">Homologação fictícia</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Organização no armaZen</p>
                <p className="mt-1 truncate font-medium">{orgName || "Organização atual"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Endpoint ilustrativo</p>
                <p className="mt-1 break-all font-mono text-sm">/demo/erp/v1</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Autenticação ilustrativa</p>
                <p className="mt-1 font-medium">Token de teste fictício</p>
              </div>
            </div>
            <button type="button" onClick={() => void testConnection()} disabled={connectionStatus === "testing"} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {connectionStatus === "testing" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              {connectionStatus === "testing" ? "Verificando..." : "Testar conexão"}
            </button>
          </section>
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h3 className="font-semibold">Limites desta demonstração</h3>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Mostra um fluxo de conexão, sem solicitar credenciais reais.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Utiliza registros de exemplo e movimentações existentes apenas para montar a prévia.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Guarda mapeamentos, resultados e histórico na sessão deste navegador.</li>
              <li className="flex gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> Não envia dados a TOTVS, Senior, Sankhya, SAP ou qualquer serviço externo.</li>
              <li className="flex gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> A conexão real exige um conector específico, credenciais e homologação do ERP escolhido.</li>
            </ul>
          </section>
        </div>
      )}

      {activeTab === "mapping" && (
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Mapeamento de campos</h3>
                <p className="mt-1 text-sm text-muted-foreground">Associe o nome do campo recebido do ERP ao campo de destino no modelo do armaZen.</p>
              </div>
              <span className="rounded-full border bg-muted px-2.5 py-1 text-xs text-muted-foreground">Materiais · ERP → armaZen</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {([
                ["code", "Código do material", true],
                ["description", "Descrição", true],
                ["category", "Categoria", false],
                ["unit", "Unidade de medida", true],
                ["barcode", "Código de barras", false],
                ["min_stock", "Estoque mínimo", false],
              ] as Array<[WmsField, string, boolean]>).map(([field, label, required]) => (
                <label key={field} className="grid gap-1.5 text-sm">
                  <span className="font-medium">{label}{required ? " *" : ""}</span>
                  <select value={mapping[field]} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))} className="h-10 rounded-lg border bg-background px-3">
                    <option value="">Não mapear</option>
                    {ERP_FIELDS.map((erpField) => <option key={erpField} value={erpField}>{erpField}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">Campo de destino: {field}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Os campos marcados com * são necessários para importar o cadastro demonstrativo. Um mapeamento real também precisaria validar domínio, tamanho, unidade e regras específicas do ERP.</p>
          </section>
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Prévia após conversão</h3>
                <p className="mt-1 text-xs text-muted-foreground">Amostra de dados fictícios recebidos do ERP e convertidos para o modelo do armaZen.</p>
              </div>
              <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (missingMappedValues ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200")}>
                {missingMappedValues ? missingMappedValues + " linha(s) incompleta(s)" : "Campos essenciais preenchidos"}
              </span>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{["Código", "Descrição", "Categoria", "Unidade", "Estoque mínimo"].map((name) => <th key={name} className="px-3 py-2.5 font-semibold">{name}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {mappedPreview.map((row, index) => <tr key={ERP_MATERIALS[index].CODPROD}>
                    <td className="px-3 py-2.5 font-mono text-xs">{row.code || "—"}</td>
                    <td className="px-3 py-2.5">{row.description || "—"}</td>
                    <td className="px-3 py-2.5">{row.category || "—"}</td>
                    <td className="px-3 py-2.5">{row.unit || "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.min_stock || "—"}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "sync" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-100 p-2.5 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200"><ArrowDownToLine className="h-5 w-5" /></div>
              <div>
                <h3 className="font-semibold">Importar do ERP</h3>
                <p className="text-xs text-muted-foreground">ERP → ambiente WMS demonstrativo</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Recebe os três cadastros de materiais fictícios, aplica o mapeamento e guarda o resultado em uma área de demonstração separada do estoque operacional.</p>
            <div className="mt-4 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2 text-sm"><span>Registros de origem</span><strong>{ERP_MATERIALS.length}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-2 text-sm"><span>Já importados nesta sessão</span><strong>{importedMaterials.length}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-2 text-sm"><span>Linhas incompletas</span><strong className={missingMappedValues ? "text-amber-700" : "text-emerald-700"}>{missingMappedValues}</strong></div>
            </div>
            {importedMaterials.length > 0 && (
              <div className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-50/50 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950/20">
                <p className="font-semibold text-emerald-800 dark:text-emerald-200">Materiais carregados no sandbox</p>
                <p className="mt-1 text-muted-foreground">{importedMaterials.map((item) => item.code).join(", ")}</p>
              </div>
            )}
            <button type="button" disabled={missingMappedValues > 0} onClick={executeImport} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
              <ArrowDownToLine className="h-4 w-4" /> Executar importação simulada
            </button>
          </section>

          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2.5 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200"><ArrowUpFromLine className="h-5 w-5" /></div>
              <div>
                <h3 className="font-semibold">Enviar ao ERP</h3>
                <p className="text-xs text-muted-foreground">armaZen → ERP demonstrativo</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Prepara até cinco movimentações recentes do armaZen e demonstra o envio em lote, a resposta do ERP e o tratamento de falhas.</p>
            <div className="mt-4 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2 text-sm"><span>Registros na prévia</span><strong>{outboundPreview.length}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-2 text-sm"><span>Origem</span><strong>{movements.length ? "Dados do armaZen" : "Exemplos fictícios"}</strong></div>
            </div>
            <label className="mt-4 flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
              <input type="checkbox" checked={forceNextFailure} onChange={(event) => setForceNextFailure(event.target.checked)} className="mt-0.5"/>
              <span><strong>Simular falha no próximo envio</strong><span className="mt-0.5 block text-xs text-muted-foreground">O ERP fictício recusará o lote para demonstrar o reprocessamento.</span></span>
            </label>
            <button type="button" disabled={!outboundPreview.length} onClick={executeOutbound} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              <ArrowUpFromLine className="h-4 w-4" /> Enviar lote simulado
            </button>
          </section>

          <section className="rounded-xl border bg-card p-4 sm:p-5 xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Prévia do lote de saída</h3>
                <p className="mt-1 text-xs text-muted-foreground">Amostra que seria convertida e enviada ao ERP. Nenhuma movimentação é criada ou alterada nesta etapa.</p>
              </div>
              <span className="rounded-full border bg-muted px-2.5 py-1 text-xs text-muted-foreground">Até 5 registros</span>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground"><tr>{["Nº", "Tipo", "Material", "Quantidade", "Origem", "Destino", "Data"].map((name) => <th key={name} className="px-3 py-2.5 font-semibold">{name}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {outboundPreview.map((row) => <tr key={row.id}>
                    <td className="px-3 py-2.5 font-mono text-xs">{row.number}</td>
                    <td className="px-3 py-2.5">{row.type}</td>
                    <td className="px-3 py-2.5">{row.material}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.quantity}</td>
                    <td className="px-3 py-2.5">{row.origin || "—"}</td>
                    <td className="px-3 py-2.5">{row.destination || "—"}</td>
                    <td className="px-3 py-2.5">{row.date}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "history" && (
        <section className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Histórico de integração</h3>
              <p className="mt-1 text-sm text-muted-foreground">Resultados das operações simuladas nesta sessão do navegador.</p>
            </div>
            <button type="button" onClick={resetDemo} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium hover:bg-muted">
              <RotateCcw className="h-3.5 w-3.5" /> Limpar demonstração
            </button>
          </div>
          {runs.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed p-8 text-center">
              <History className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 font-medium">Nenhuma operação executada</p>
              <p className="mt-1 text-sm text-muted-foreground">Teste a conexão e execute uma importação ou envio para gerar o histórico demonstrativo.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {runs.map((run) => (
                <article key={run.id} className="rounded-lg border p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="rounded-lg bg-muted p-2">{run.direction === "inbound" ? <ArrowDownToLine className="h-4 w-4"/> : <ArrowUpFromLine className="h-4 w-4"/>}</div>
                      <div className="min-w-0">
                        <p className="font-semibold">{run.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{run.id} · {dateTimeLabel(run.createdAt)}</p>
                      </div>
                    </div>
                    <StatusLabel status={run.status}/>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{run.message}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>{run.records} registro(s)</span><span>{run.attempts} tentativa(s)</span>
                    <span>{run.direction === "inbound" ? "ERP → armaZen (sandbox)" : "armaZen → ERP simulado"}</span>
                  </div>
                  {run.payload.length > 0 && (
                    <details className="mt-3 rounded-lg bg-muted/40 p-3">
                      <summary className="cursor-pointer text-xs font-semibold">Ver payload de demonstração</summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5">{JSON.stringify(run.payload, null, 2)}</pre>
                    </details>
                  )}
                  {run.status === "failed" && (
                    <button type="button" onClick={() => retryRun(run.id)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-amber-400 px-3 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/30">
                      <RotateCcw className="h-3.5 w-3.5" /> Reprocessar lote
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5"/> Histórico temporário desta sessão do navegador</span>
        <span className="inline-flex items-center gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5"/> Sem comunicação com ERP externo</span>
      </div>
    </div>
  );
}
