// Server-only provisioning for isolated, one-hour demo workspaces.
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./client.server";
import { serverRuntimeEnv } from "@/lib/runtime-env.server";

export type DemoRole = "consulta" | "operacao" | "gestao";

const DEMO_ROLES: DemoRole[] = ["consulta", "operacao", "gestao"];
const ROLE_LABELS: Record<DemoRole, string> = {
  consulta: "Consulta",
  operacao: "Operação",
  gestao: "Gestão",
};
const SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

type DemoSessionRow = {
  session_id: string;
  consulta_user_id: string;
  operacao_user_id: string;
  gestao_user_id: string;
  expires_at: string;
};

function isDemoRole(value: unknown): value is DemoRole {
  return value === "consulta" || value === "operacao" || value === "gestao";
}

function generateDemoPassword(): string {
  return randomBytes(36).toString("base64url");
}

function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function getRequestIp(): string | null {
  try {
    const request = getRequest();
    // Use platform-generated headers only; do not trust arbitrary x-forwarded-for.
    const raw =
      request.headers.get("x-vercel-forwarded-for") ??
      request.headers.get("cf-connecting-ip");
    const address = raw?.split(",")[0]?.trim();
    return address && address.length <= 128 ? address : null;
  } catch {
    return null;
  }
}

async function getClientHash(): Promise<string | null> {
  const ip = getRequestIp();
  if (!ip) return null;

  const secret = await serverRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) return null;

  // Store a keyed digest, never the visitor's raw network address.
  return createHmac("sha256", secret).update(ip, "utf8").digest("hex");
}

function roleEmail(sessionId: string, role: DemoRole): string {
  return `demo.${sessionId}.${role}@armazen.app`;
}

function logDemoFailure(operation: string, role: DemoRole | undefined, error: unknown) {
  const details =
    error && typeof error === "object"
      ? (error as { name?: unknown; message?: unknown; status?: unknown; code?: unknown })
      : { message: error };

  console.error("[Demo] Isolated workspace operation failed", {
    operation,
    role,
    name: typeof details.name === "string" ? details.name : undefined,
    status:
      typeof details.status === "number" || typeof details.status === "string"
        ? details.status
        : undefined,
    code: typeof details.code === "string" ? details.code : undefined,
    message: String(details.message ?? "Unknown error").slice(0, 400),
  });
}

async function findActiveSession(
  admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
  tokenHash: string,
): Promise<DemoSessionRow | null> {
  const { data, error } = await (admin as any)
    .from("demo_visitor_sessions")
    .select("session_id, consulta_user_id, operacao_user_id, gestao_user_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    logDemoFailure("findActiveSession", undefined, error);
    throw new Error(
      "Não foi possível verificar a sessão de demonstração. Confirme se a migração de ambientes isolados foi aplicada.",
    );
  }

  if (!data || Date.parse(data.expires_at) <= Date.now()) return null;
  return data as DemoSessionRow;
}

async function createVisitorUser(
  admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
  sessionId: string,
  role: DemoRole,
): Promise<User> {
  const email = roleEmail(sessionId, role);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: generateDemoPassword(),
    email_confirm: true,
    app_metadata: {
      armaZenDemoRole: role,
      armaZenDemoSessionId: sessionId,
    },
    user_metadata: {
      full_name: `Demonstração — ${ROLE_LABELS[role]}`,
    },
  });

  if (error || !data.user) {
    logDemoFailure("createUser", role, error ?? new Error("Supabase did not return a user"));
    throw new Error("Não foi possível preparar um dos perfis demonstrativos. Tente novamente.");
  }

  return data.user;
}

async function provisionVisitorSession(
  admin: Awaited<ReturnType<typeof createSupabaseAdminClient>>,
  sessionToken: string,
): Promise<{ session: DemoSessionRow; expiresAt: string }> {
  const sessionId = randomUUID();
  const tokenHash = hashSessionToken(sessionToken);
  const createdUsers: User[] = [];

  try {
    for (const role of DEMO_ROLES) {
      createdUsers.push(await createVisitorUser(admin, sessionId, role));
    }

    const userByRole = new Map<DemoRole, User>(
      DEMO_ROLES.map((role, index) => [role, createdUsers[index]!]),
    );
    const clientHash = await getClientHash();

    const { data: expiresAt, error } = await (admin as any).rpc(
      "create_demo_visitor_workspace",
      {
        _session_id: sessionId,
        _token_hash: tokenHash,
        _consulta: userByRole.get("consulta")!.id,
        _operacao: userByRole.get("operacao")!.id,
        _gestao: userByRole.get("gestao")!.id,
        _client_hash: clientHash,
      },
    );

    if (error || !expiresAt) {
      logDemoFailure(
        "create_demo_visitor_workspace",
        undefined,
        error ?? new Error("No expiry returned"),
      );
      throw new Error(
        "Não foi possível criar o ambiente individual. Confirme se as migrações de demonstração estão aplicadas.",
      );
    }

    return {
      session: {
        session_id: sessionId,
        consulta_user_id: userByRole.get("consulta")!.id,
        operacao_user_id: userByRole.get("operacao")!.id,
        gestao_user_id: userByRole.get("gestao")!.id,
        expires_at: String(expiresAt),
      },
      expiresAt: String(expiresAt),
    };
  } catch (error) {
    // Roll back Auth accounts if the database transaction did not complete.
    await Promise.allSettled(
      createdUsers.map((user) => admin.auth.admin.deleteUser(user.id)),
    );
    throw error;
  }
}

export const startDemoSession = createServerFn({ method: "POST" })
  .validator((data: { role: DemoRole; sessionToken?: string }) => {
    if (!data || !isDemoRole(data.role)) {
      throw new Error("Selecione um dos três perfis de demonstração.");
    }
    if (data.sessionToken !== undefined && !SESSION_TOKEN_PATTERN.test(data.sessionToken)) {
      throw new Error(
        "A sessão demonstrativa desta aba é inválida. Atualize a página e tente novamente.",
      );
    }
    return data;
  })
  .handler(async ({ data }) => {
    const admin = await createSupabaseAdminClient();
    let sessionToken = data.sessionToken || generateSessionToken();
    let session = data.sessionToken
      ? await findActiveSession(admin, hashSessionToken(data.sessionToken))
      : null;
    let expiresAt = session?.expires_at ?? "";

    if (!session) {
      // Never reuse an expired token. A new session gets a new set of accounts
      // and a fresh one-hour timer; expired records are handled by the cron.
      if (data.sessionToken) sessionToken = generateSessionToken();
      const created = await provisionVisitorSession(admin, sessionToken);
      session = created.session;
      expiresAt = created.expiresAt;
    }

    const email = roleEmail(session.session_id, data.role);
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !linkData.properties?.hashed_token) {
      logDemoFailure(
        "generateLink",
        data.role,
        linkError ?? new Error("No hashed token returned"),
      );
      throw new Error("Não foi possível iniciar o perfil de demonstração. Tente novamente.");
    }

    return {
      authTokenHash: linkData.properties.hashed_token,
      sessionToken,
      expiresAt,
    };
  });

export const restoreDemoSession = createServerFn({ method: "POST" })
  .validator((data: { sessionToken: string }) => {
    if (!data || !SESSION_TOKEN_PATTERN.test(data.sessionToken)) {
      throw new Error("Não há um ambiente válido de demonstração nesta aba.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const admin = await createSupabaseAdminClient();
    const { data: expiresAt, error } = await (admin as any).rpc(
      "restore_demo_visitor_workspace",
      { _token_hash: hashSessionToken(data.sessionToken) },
    );

    if (error || !expiresAt) {
      logDemoFailure(
        "restore_demo_visitor_workspace",
        undefined,
        error ?? new Error("No expiry returned"),
      );
      throw new Error(
        "Não foi possível restaurar esta demonstração. A sessão pode ter expirado; entre novamente para criar um novo ambiente.",
      );
    }

    return { expiresAt: String(expiresAt) };
  });
