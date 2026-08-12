const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") || "";
const MAX_POINTS_PER_ROUTE_REQUEST = 25;
const DEFAULT_ALLOWED_ORIGINS = [
  "https://mm-sales-order-app.vercel.app",
  "https://mm-sales-order-app-jx83.vercel.app",
  "http://localhost:3005",
  "http://127.0.0.1:3005",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

type RoutePoint = {
  latitude: number;
  longitude: number;
};

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

function assertConfigured() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GOOGLE_MAPS_API_KEY) {
    throw new Error("Route path function secrets are not configured.");
  }
}

async function assertAuthenticated(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new Error("Login required.");
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: SERVICE_ROLE_KEY,
    },
  });

  if (!response.ok) {
    throw new Error("Login expired. Please login again.");
  }
}

function normalizePoint(value: unknown): RoutePoint | null {
  const point = value as Record<string, unknown>;
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function routeWaypoint(point: RoutePoint) {
  return {
    location: {
      latLng: {
        latitude: point.latitude,
        longitude: point.longitude,
      },
    },
  };
}

function pointBatches(points: RoutePoint[]) {
  if (points.length <= MAX_POINTS_PER_ROUTE_REQUEST) return [points];

  const batches: RoutePoint[][] = [];
  let start = 0;
  while (start < points.length - 1) {
    const batch = points.slice(start, start + MAX_POINTS_PER_ROUTE_REQUEST);
    if (batch.length < 2) break;
    batches.push(batch);
    start += MAX_POINTS_PER_ROUTE_REQUEST - 1;
  }
  return batches;
}

async function computeWalkingRoute(points: RoutePoint[]) {
  const polylines: string[] = [];
  let distanceMeters = 0;
  let durationSeconds = 0;

  for (const batch of pointBatches(points)) {
    const origin = batch[0];
    const destination = batch[batch.length - 1];
    const intermediates = batch.slice(1, -1).map(routeWaypoint);

    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: routeWaypoint(origin),
        destination: routeWaypoint(destination),
        intermediates,
        travelMode: "WALK",
        computeAlternativeRoutes: false,
        polylineQuality: "HIGH_QUALITY",
        units: "METRIC",
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || "Google Routes API rejected the route request.";
      throw new Error(message);
    }

    const route = payload?.routes?.[0];
    const encodedPolyline = route?.polyline?.encodedPolyline;
    if (encodedPolyline) polylines.push(encodedPolyline);
    distanceMeters += Number(route?.distanceMeters || 0);
    const duration = String(route?.duration || "0s").replace("s", "");
    durationSeconds += Number(duration || 0);
  }

  return { polylines, distanceMeters, durationSeconds };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, origin);
  }

  try {
    assertConfigured();
    if (!isOriginAllowed(origin)) {
      return jsonResponse({ error: "Origin is not allowed." }, 403, origin);
    }

    await assertAuthenticated(req);

    const body = await req.json().catch(() => ({}));
    const points = Array.isArray(body?.points)
      ? body.points.map(normalizePoint).filter(Boolean) as RoutePoint[]
      : [];

    if (points.length < 2) {
      return jsonResponse({ polylines: [], distanceMeters: 0, durationSeconds: 0 }, 200, origin);
    }

    if (points.length > 120) {
      throw new Error("Too many route points. Please filter to a smaller date range.");
    }

    return jsonResponse(await computeWalkingRoute(points), 200, origin);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Route path failed." }, 400, origin);
  }
});
