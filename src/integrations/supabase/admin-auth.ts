// Server-only: creates or ensures a user exists, bypassing email confirmation.
// Uses the service role key — never import this in client code.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "./client.server";

export const ensureUserExists = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { email, password } = data;

    // Try to create the user. If they already exist, update their password instead.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email confirmation
    });

    if (!createErr) {
      return { userId: created.user.id };
    }

    // User already exists (error code 422 / "already registered") — update password
    if (createErr.message.toLowerCase().includes("already") || createErr.status === 422) {
      // Find user by email to get their ID
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (listErr) throw new Error(listErr.message);

      const existing = list.users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (existing) {
        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
          existing.id,
          { password, email_confirm: true }
        );
        if (updateErr) throw new Error(updateErr.message);
        return { userId: existing.id };
      }
    }

    throw new Error(createErr.message);
  });
