// Server-only demo session provisioning. The browser cannot choose arbitrary
// emails or passwords, and this endpoint can only issue sessions for the three
// reserved, fictitious demonstration profiles.
import { createServerFn } from "@tanstack/react-start";
import type { User } from "@supabase/supabase-js";
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

/**
 * Log only the diagnostic fields needed to debug Supabase Auth. Never log
 * request headers, API keys, passwords, access tokens, or generated links.
 */
function logAuthFailure(
  operation: string,
  role: DemoRole,
  email: string,
  error: unknown,
) {
  const details =
    error && typeof error === "object"
      ? (error as {
          name?: unknown;
          message?: unknown;
          status?: unknown;
          statusCode?: unknown;
          code?: unknown;
        })
      : { message: error };

  console.error("[Demo] Supabase Auth operation failed", {
    operation,
    role,
    email,
    name: typeof details.name === "string" ? details.name : undefined,
    status:
      typeof details.status === "number" || typeof details.status === "string"
        ? details.status
        : typeof details.statusCode === "number" || typeof details.statusCode === "string"
          ? details.statusCode
          : undefined,
    code: typeof details.code === "string" ? details.code : undefined,
    message:
      typeof details.message === "string"
        ? details.message.slice(0, 500)
        : String(details.message ?? "Unknown error").slice(0, 500),
  });
}

async function findUserByEmail(
  supabaseAdmin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
  email: string,
  role: DemoRole,
) {
  const pageSize = 1000;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });
    if (error) {
      logAuthFailure("listUsers", role, email, error);
      throw new Error(
        "Não foi possível verificar a conta de demonstração. Consulte os logs do servidor.",
      );
    }
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < pageSize) return null;
  }
  throw new Error("Não foi possível localizar a conta reservada para demonstração.");
}

async function prepareExistingDemoUser(
  supabaseAdmin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
  role: DemoRole,
  existing: User,
) {
  const profile = DEMO_PROFILES[role];
  const existingRole = existing.app_metadata?.armaZenDemoRole;

  if (existingRole === role) return existing;
  if (existingRole !== undefined && existingRole !== null && existingRole !== "") {
    throw new Error(
      `O e-mail reservado para demonstração está marcado com outro perfil. Revise a conta ${profile.email} no Supabase Auth.`,
    );
  }

  // These addresses are hard-coded, reserved demo identities (never caller
  // supplied). If one was created manually, finish the same provisioning
  // safely: mark its role, confirm it and replace any manually chosen password
  // with an unknown random password. Demo entry uses a one-time magic link.
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
    app_metadata: {
      ...(existing.app_metadata ?? {}),
      armaZenDemoRole: role,
    },
    user_metadata: {
      ...(existing.user_metadata ?? {}),
      full_name: profile.name,
    },
    email_confirm: true,
    password: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
  });

  if (error || !data.user) {
    logAuthFailure(
      "updateUserById",
      role,
      profile.email,
      error ?? new Error("Supabase returned no user"),
    );
    throw new Error(
      "Não foi possível regularizar a conta reservada para demonstração. Consulte os logs do servidor.",
    );
  }

  return data.user;
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

  const errorMessage = error?.message.toLowerCase() ?? "";
  // Do not treat every HTTP 422 as a duplicate: Auth can return 422 for other
  // validation failures, and those must remain visible in server diagnostics.
  const isDuplicate =
    /already\s+(registered|exists)|already been registered|user already registered|email.*already|duplicate user/.test(
      errorMessage,
    );

  if (!isDuplicate) {
    logAuthFailure(
      "createUser",
      role,
      profile.email,
      error ?? new Error("Supabase returned no user"),
    );
    throw new Error(
      "Não foi possível preparar a conta de demonstração no Supabase Auth. Consulte os logs do servidor.",
    );
  }

  const existing = await findUserByEmail(supabaseAdmin, profile.email, role);
  if (!existing) {
    logAuthFailure(
      "createUser duplicate reconciliation",
      role,
      profile.email,
      error ?? new Error("Auth reported a duplicate but listUsers returned no matching user"),
    );
    throw new Error(
      "O Supabase Auth indicou que a conta já existe, mas não foi possível localizá-la. Consulte os logs do servidor.",
    );
  }

  return prepareExistingDemoUser(supabaseAdmin, role, existing);
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
      logAuthFailure(
        "generateLink",
        data.role,
        email,
        linkError ?? new Error("Supabase did not return a hashed token"),
      );
      throw new Error(
        "Não foi possível iniciar a sessão demonstrativa. Consulte os logs do servidor.",
      );
    }

    // A one-time token is returned only for one of the three public demo profiles.
    // The service-role key and all non-demo user details remain on the server.
    return { tokenHash: linkData.properties.hashed_token };
  });
