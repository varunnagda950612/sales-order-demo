import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { getSupabaseServerEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginEmailDomain = process.env.LOGIN_EMAIL_DOMAIN || "manishmasala.local";
const managedRoles = new Set(["admin", "manager", "sales"]);
const defaultGeofenceMeters = 100;
const minimumGeofenceMeters = 10;
const maximumGeofenceMeters = 1000;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

function loginIdToEmail(loginId: string) {
  const value = loginId.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${loginEmailDomain}`;
}

function validateLoginId(loginId: string) {
  if (!/^[a-z0-9._@-]+$/i.test(loginId)) {
    throw new Error("Login ID can only contain letters, numbers, dot, dash, underscore, or @.");
  }
}

function validatePassword(password: string) {
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
}

function geofenceMetersFromBody(body: Record<string, unknown>) {
  const meters = Number(body.geofenceMeters || defaultGeofenceMeters);

  if (
    !Number.isInteger(meters) ||
    meters < minimumGeofenceMeters ||
    meters > maximumGeofenceMeters
  ) {
    throw new Error(
      `GPS range must be between ${minimumGeofenceMeters} and ${maximumGeofenceMeters} meters.`,
    );
  }

  return meters;
}

async function requireActiveAdmin() {
  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);

  if (!profile || profile.role !== "admin" || !profile.active) {
    throw new Error("Only active admins can manage users.");
  }

  return profile;
}

function createAdminClient() {
  const env = getSupabaseServerEnv();
  const serviceRoleKey = getServiceRoleKey();

  if (!env.success || !serviceRoleKey) {
    throw new Error("Server-side Supabase admin credentials are not configured.");
  }

  return createClient(env.data.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(error.message);
    }

    const users = data.users || [];
    const match = users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);

    if (match) {
      return match;
    }

    if (users.length < perPage) {
      return null;
    }
  }
}

async function createUser(supabase: SupabaseClient, body: Record<string, unknown>) {
  const fullName = String(body.name || "").trim();
  const loginId = String(body.loginId || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "sales").trim().toLowerCase();
  const geofenceMeters = geofenceMetersFromBody(body);

  if (!fullName || !loginId) {
    throw new Error("Name and login ID are required.");
  }

  if (!managedRoles.has(role)) {
    throw new Error("Role must be admin, manager, or sales.");
  }

  validateLoginId(loginId);
  validatePassword(password);

  const email = loginIdToEmail(loginId);
  const existingAuthUser = await findAuthUserByEmail(supabase, email);
  const existingAuthUserId = existingAuthUser?.id || "";

  if (existingAuthUserId) {
    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("active")
      .eq("id", existingAuthUserId)
      .maybeSingle<{ active: boolean | null }>();

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (existingProfile?.active === true) {
      throw new Error("A user with this login ID already exists.");
    }
  }

  const userPayload = {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      login_id: loginId,
      role,
    },
  };
  const authResponse = existingAuthUserId
    ? await supabase.auth.admin.updateUserById(existingAuthUserId, userPayload)
    : await supabase.auth.admin.createUser(userPayload);

  if (authResponse.error) {
    throw new Error(authResponse.error.message);
  }

  const authUserId = authResponse.data.user?.id;

  if (!authUserId) {
    throw new Error("Auth user was saved but no user ID was returned.");
  }

  const { data: profileRows, error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: authUserId,
        full_name: fullName,
        login_id: loginId,
        role,
        geofence_meters: geofenceMeters,
        active: true,
      },
      { onConflict: "id" },
    )
    .select("id, full_name, login_id, role, geofence_meters, active");

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return { user: profileRows?.[0] || null };
}

async function resetPassword(supabase: SupabaseClient, body: Record<string, unknown>) {
  const userId = String(body.userId || "").trim();
  const password = String(body.password || "");

  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("Valid user ID is required.");
  }

  validatePassword(password);

  const { error } = await supabase.auth.admin.updateUserById(userId, { password });

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true };
}

function assertUuid(value: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error("Valid user ID is required.");
  }
}

async function countLinkedRows(
  supabase: SupabaseClient,
  tableName: string,
  columnName: string,
  userId: string,
) {
  const { count, error } = await supabase
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq(columnName, userId);

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

async function assertUserCanBeDeleted(supabase: SupabaseClient, userId: string) {
  const linkedRows = [
    ["orders", "sales_person_id", "orders"],
    ["visit_proofs", "sales_person_id", "visit proofs"],
    ["collections", "sales_person_id", "collections"],
    ["core_data_events", "actor_id", "sync recovery events"],
  ] as const;

  const counts = await Promise.all(
    linkedRows.map(async ([tableName, columnName, label]) => ({
      label,
      count: await countLinkedRows(supabase, tableName, columnName, userId),
    })),
  );
  const blockingLabels = counts
    .filter((item) => item.count > 0)
    .map((item) => `${item.count} ${item.label}`);

  if (blockingLabels.length) {
    throw new Error(
      `This user has linked ${blockingLabels.join(", ")}. Deactivate the user instead so historical data remains intact.`,
    );
  }
}

async function clearOptionalUserLinks(supabase: SupabaseClient, userId: string) {
  const operations = [
    supabase.from("shops").update({ assigned_to: null }).eq("assigned_to", userId),
    supabase.from("shops").update({ created_by: null }).eq("created_by", userId),
    supabase.from("sales_targets").delete().eq("sales_person_id", userId),
    supabase.from("sales_targets").update({ created_by: null }).eq("created_by", userId),
    supabase.from("route_overrides").delete().eq("sales_person_id", userId),
    supabase.from("route_overrides").update({ created_by: null }).eq("created_by", userId),
    supabase.from("area_route_schedules").delete().eq("sales_person_id", userId),
    supabase.from("area_route_schedules").update({ created_by: null }).eq("created_by", userId),
    supabase.from("audit_logs").update({ changed_by: null }).eq("changed_by", userId),
    supabase.from("sync_recovery_snapshots").delete().eq("sales_person_id", userId),
    supabase.from("sync_device_health").delete().eq("sales_person_id", userId),
  ];

  const results = await Promise.all(operations);
  const error = results.find((result) => result.error)?.error;

  if (error) {
    throw new Error(error.message);
  }
}

async function deleteUser(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  requesterId: string,
) {
  const userId = String(body.userId || "").trim();
  assertUuid(userId);

  if (userId === requesterId) {
    throw new Error("You cannot delete your own admin account while signed in.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, login_id")
    .eq("id", userId)
    .maybeSingle<{ id: string; full_name: string | null; login_id: string | null }>();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    throw new Error("User profile was not found.");
  }

  await assertUserCanBeDeleted(supabase, userId);
  await clearOptionalUserLinks(supabase, userId);

  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
  if (authDeleteError && !authDeleteError.message.toLowerCase().includes("not found")) {
    throw new Error(authDeleteError.message);
  }

  const { error: profileDeleteError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (profileDeleteError) {
    throw new Error(profileDeleteError.message);
  }

  return {
    ok: true,
    user: {
      id: profile.id,
      full_name: profile.full_name,
      login_id: profile.login_id,
    },
  };
}

export async function POST(request: Request) {
  try {
    const requester = await requireActiveAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    const adminClient = createAdminClient();

    if (action === "create-user" || action === "create-salesperson") {
      return NextResponse.json(await createUser(adminClient, body));
    }

    if (action === "reset-password") {
      return NextResponse.json(await resetPassword(adminClient, body));
    }

    if (action === "delete-user") {
      return NextResponse.json(await deleteUser(adminClient, body, requester.id));
    }

    return jsonError("Unknown action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin user request failed.";
    const status = message.includes("Only active admins") ? 403 : 400;
    return jsonError(message, status);
  }
}
