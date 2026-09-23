// supabase/functions/admin-users/index.ts
//
// Handles the three admin actions that cannot be done from the browser with
// the anon key: creating a trainer account, deleting one, and resetting a
// password. All three need Supabase's service-role Admin API, which bypasses
// every RLS policy in the database — so this function independently verifies
// the caller is an admin (against this project's own `profiles` table)
// before doing anything, rather than trusting the client at all.
//
// Deploy with the Supabase CLI:
//   supabase functions deploy admin-users
//
// The two secrets below are already available to every Edge Function
// automatically in a Supabase project — nothing extra to configure:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- Verify the caller is an admin -----------------------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing Authorization header" });

    const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(jwt);
    if (callerAuthError || !callerAuth.user) return json({ error: "Invalid session" });

    const { data: callerProfile, error: callerProfileError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("auth_id", callerAuth.user.id)
      .single();

    if (callerProfileError || !callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Admin access required" });
    }

    const body = await req.json();
    const action = body.action as string;

    // --- Create a new trainer account ------------------------------------
    if (action === "create_user") {
      const { email, password, username } = body as { email: string; password: string; username?: string };
      if (!email || !password) return json({ error: "email and password are required" });

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: username ? { username } : undefined,
      });
      if (createError) return json({ error: createError.message });

      await admin.from("admin_activity_log").insert({
        admin_id: callerProfile.id,
        action: "user_created",
        details: { email },
      });

      return json({ ok: true, auth_id: created.user?.id });
    }

    // --- Delete a trainer account ------------------------------------------
    if (action === "delete_user") {
      const { auth_id, username } = body as { auth_id: string; username?: string };
      if (!auth_id) return json({ error: "auth_id is required" });

      const { error: deleteError } = await admin.auth.admin.deleteUser(auth_id);
      if (deleteError) return json({ error: deleteError.message });

      await admin.from("admin_activity_log").insert({
        admin_id: callerProfile.id,
        action: "user_deleted",
        details: { username: username ?? null, auth_id },
      });

      return json({ ok: true });
    }

    // --- Reset a trainer's password ----------------------------------------
    if (action === "reset_password") {
      const { auth_id, new_password, username } = body as {
        auth_id: string;
        new_password: string;
        username?: string;
      };
      if (!auth_id || !new_password) return json({ error: "auth_id and new_password are required" });
      if (new_password.length < 6) return json({ error: "Password must be at least 6 characters" });

      const { error: resetError } = await admin.auth.admin.updateUserById(auth_id, { password: new_password });
      if (resetError) return json({ error: resetError.message });

      await admin.from("admin_activity_log").insert({
        admin_id: callerProfile.id,
        action: "password_reset",
        details: { username: username ?? null },
      });

      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" });
  }
});
