// Server-only demo session provisioning. The browser cannot choose arbitrary
// emails or passwords, and this endpoint can only issue sessions for the three
// reserved, fictitious demonstration profiles.
import { createServerFn } from "@tanstack/react-start";
import { createSupabaseAdminClient } from "./client.server";

export type DemoRole = "consulta" | "operacao" | "gestao";

const DEMO_PROFILES: Record<DemoRole, { email: string; name: string }> = {
  consulta: { email: "demo.consulta@armazen.app", name: "Demonstração — Consulta" },
  operacao: { email: "demo.operacao@armazen.app", name: "Demonstração — Operação" },
  gestao: { email: "demo.gestao@armazen.app", name: "Demonstração — Gestão" },
};

function isDemoRole(value: unknown): value is DemoRole {
  return value === "consulta" || value === "operacao" || value === "gestao";
}

async function findUserByEmail(
  supabaseAdmin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
  email: string,
) {
  const pageSize = 1000;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });
    if (error) throw new Error("Não foi possível verificar a conta de demonstração.");
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < pageSize) return null;
  }
  throw new Error("Não foi possível localizar a conta reservada para demonstração.");
}

async function ensureDemoUser(
  supabaseAdmin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
  role: DemoRole,
) {
  const profile = DEMO_PROFILES[role];
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: profile.email,
    password: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
    email_confirm: true,
    app_metadata: { armaZenDemoRole: role },
    user_metadata: { full_name: profile.name },
  });

  if (!error && data.user) return data.user;

  const isDuplicate =
    error?.status === 422 ||
    error?.message.toLowerCase().includes("already") === true ||
    error?.message.toLowerCase().includes("registered") === true;

  if (!isDuplicate) {
    throw new Error("Não foi possível preparar a conta de demonstração no Supabase Auth.");
  }

  const existing = await findUserByEmail(supabaseAdmin, profile.email);
  if (!existing || existing.app_metadata?.armaZenDemoRole !== role) {
    // Never adopt, reset or change the password of an unrelated account even
    // when its email happens to match one of the reserved demo addresses.
    throw new Error(
      `O e-mail reservado para o perfil ${role} já existe sem a identificação segura de demonstração. Revise essa conta no Supabase Auth.`,
    );
  }

  return existing;
}

export const startDemoSession = createServerFn({ method: "POST" })
  .validator((data: { role: DemoRole }) => {
    if (!data || !isDemoRole(data.role)) {
      throw new Error("Selecione um dos três perfis de demonstração.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const supabaseAdmin = await createSupabaseAdminClient();

    // Accounts are fixed server-side; callers cannot pass an email or password.
    const [consulta, operacao, gestao] = await Promise.all([
      ensureDemoUser(supabaseAdmin, "consulta"),
      ensureDemoUser(supabaseAdmin, "operacao"),
      ensureDemoUser(supabaseAdmin, "gestao"),
    ]);

    const { error: workspaceError } = await supabaseAdmin.rpc("ensure_demo_workspace", {
      _consulta: consulta.id,
      _operacao: operacao.id,
      _gestao: gestao.id,
    });
    if (workspaceError) {
      console.error("[Demo] Workspace provisioning failed:", workspaceError.message);
      throw new Error(
        "Não foi possível preparar os perfis demonstrativos. Confirme se a migração de demonstração do Supabase foi aplicada.",
      );
    }

    const email = DEMO_PROFILES[data.role].email;
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
    if (linkError || !linkData.properties?.hashed_token) {
      console.error("[Demo] Magic-link generation failed:", linkError?.message);
      throw new Error("Não foi possível iniciar a sessão demonstrativa. Tente novamente.");
    }

    // A one-time token is returned only for one of the three public demo profiles.
    // The service-role key and all non-demo user details remain on the server.
    return { tokenHash: linkData.properties.hashed_token };
  });
