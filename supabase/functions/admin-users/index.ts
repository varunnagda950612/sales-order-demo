const LOGIN_EMAIL_DOMAIN = Deno.env.get("LOGIN_EMAIL_DOMAIN") || "sales-order-demo.invalid";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MANAGED_ROLES = new Set(["sales", "manager", "admin"]);
const DEFAULT_GEOFENCE_METERS = 100;
const MIN_GEOFENCE_METERS = 10;
const MAX_GEOFENCE_METERS = 1000;
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3005",
  "http://127.0.0.1:3005",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function configuredOrigins() {
  const envOrigins = (Deno.env.get("APP_ORIGIN") || "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  return Array.from(new Set([...envOrigins, ...DEFAULT_ALLOWED_ORIGINS]));
}

function normalizeOrigin(origin: string | null) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function isOriginAllowed(origin: string | null) {
  const origins = configuredOrigins();
  return !origins.length || !origin || origins.includes(normalizeOrigin(origin));
}

function corsHeaders(origin: string | null) {
  const origins = configuredOrigins();
  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigin = origins.length
    ? normalizedOrigin && origins.includes(normalizedOrigin)
      ? normalizedOrigin
      : origins[0]
    : normalizedOrigin || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

function loginIdToEmail(loginId: string) {
  const value = loginId.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${LOGIN_EMAIL_DOMAIN}`;
}

function assertConfigured() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase function secrets are not configured.");
  }
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
  const meters = Number(body.geofenceMeters || DEFAULT_GEOFENCE_METERS);
  if (!Number.isInteger(meters) || meters < MIN_GEOFENCE_METERS || meters > MAX_GEOFENCE_METERS) {
    throw new Error(`GPS range must be between ${MIN_GEOFENCE_METERS} and ${MAX_GEOFENCE_METERS} meters.`);
  }
  return meters;
}

async function findAuthUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const data = await supabaseFetch(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
    const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    const match = users.find((user: Record<string, unknown>) =>
      String(user.email || "").trim().toLowerCase() === normalizedEmail
    );

    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function profileForUserId(userId: string) {
  const rows = await supabaseFetch(
    `/rest/v1/profiles?select=id,active,login_id&id=eq.${encodeURIComponent(userId)}`,
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || "Supabase request failed.");
  }
  return data;
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("Missing authenticated user.");
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  if (!response.ok || !data?.id) {
    throw new Error("Invalid authenticated user.");
  }
  return data;
}

async function assertAdmin(userId: string) {
  const rows = await supabaseFetch(
    `/rest/v1/profiles?select=role,active&id=eq.${encodeURIComponent(userId)}`,
  );
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (profile?.role !== "admin" || profile?.active !== true) {
    throw new Error("Only active admins can manage users.");
  }
}

async function createUser(body: Record<string, unknown>) {
  const name = String(body.name || "").trim();
  const loginId = String(body.loginId || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "sales").trim().toLowerCase();
  const geofenceMeters = geofenceMetersFromBody(body);

  if (!name || !loginId) {
    throw new Error("Name and login ID are required.");
  }
  if (!MANAGED_ROLES.has(role)) {
    throw new Error("Role must be sales, manager, or admin.");
  }
  validateLoginId(loginId);
  validatePassword(password);

  const email = loginIdToEmail(loginId);
  const existingAuthUser = await findAuthUserByEmail(email);
  const existingAuthUserId = existingAuthUser?.id ? String(existingAuthUser.id) : "";
  const existingProfile = existingAuthUserId ? await profileForUserId(existingAuthUserId) : null;

  if (existingProfile?.active === true) {
    throw new Error("A user with this login ID already exists.");
  }

  const userPayload = {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: name,
      login_id: loginId,
      role,
    },
  };

  const authUser = existingAuthUserId
    ? await supabaseFetch(`/auth/v1/admin/users/${encodeURIComponent(existingAuthUserId)}`, {
        method: "PUT",
        body: JSON.stringify(userPayload),
      })
    : await supabaseFetch("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify(userPayload),
      });
  const authUserId = authUser?.id || authUser?.user?.id;
  if (!authUserId) {
    throw new Error("Auth user was saved but no user ID was returned.");
  }

  const profileRows = await supabaseFetch("/rest/v1/profiles", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      id: authUserId,
      full_name: name,
      login_id: loginId,
      role,
      geofence_meters: geofenceMeters,
      active: true,
    }),
  });

  return {
    user: {
      id: authUserId,
      full_name: profileRows?.[0]?.full_name || name,
      login_id: profileRows?.[0]?.login_id || loginId,
      role,
      geofence_meters: profileRows?.[0]?.geofence_meters || geofenceMeters,
      active: true,
    },
  };
}

async function resetPassword(body: Record<string, unknown>) {
  const userId = String(body.userId || "").trim();
  const password = String(body.password || "");

  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("Valid user ID is required.");
  }
  validatePassword(password);

  await supabaseFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });

  return { ok: true };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  try {
    assertConfigured();
    if (!isOriginAllowed(origin)) {
      return jsonResponse({ error: "Origin is not allowed." }, 403, origin);
    }
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, origin);
    }

    const requester = await authenticatedUser(req);
    await assertAdmin(requester.id);

    const body = await req.json();
    const action = String(body.action || "");

    if (action === "create-user" || action === "create-salesperson") {
      return jsonResponse(await createUser(body), 200, origin);
    }
    if (action === "reset-password") {
      return jsonResponse(await resetPassword(body), 200, origin);
    }

    return jsonResponse({ error: "Unknown action." }, 400, origin);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Request failed." }, 400, origin);
  }
});
