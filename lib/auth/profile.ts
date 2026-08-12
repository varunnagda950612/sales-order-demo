import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AppRole, UserProfile } from "@/types/domain";
import { isLocalAppMode } from "@/lib/config/app-mode";
import { getSupabaseUserWithRetry } from "@/lib/supabase/auth-retry";
import { getLocalServerProfile } from "./local-session-server";
import { getDashboardPath, isAppRole, loginPath } from "./routing";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  login_id: string | null;
  active: boolean | null;
  geofence_meters?: number | null;
};

function mapProfileRow(row: ProfileRow): UserProfile | null {
  if (!isAppRole(row.role)) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name?.trim() || "User",
    role: row.role,
    loginId: row.login_id?.trim() || "",
    active: row.active === true,
    geofenceMeters: row.geofence_meters ?? null,
  };
}

export async function getProfileForUser(supabase: SupabaseClient, user: User) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, login_id, active, geofence_meters")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (error || !data) {
    return null;
  }

  return mapProfileRow(data);
}

export async function getCurrentProfile(supabase: SupabaseClient) {
  if (isLocalAppMode()) {
    return getLocalServerProfile();
  }

  const {
    data: { user },
  } = await getSupabaseUserWithRetry(supabase);

  if (!user) {
    return null;
  }

  return getProfileForUser(supabase, user);
}

export async function requireCurrentProfile(supabase: SupabaseClient) {
  const profile = await getCurrentProfile(supabase);

  if (!profile || !profile.active) {
    redirect(loginPath);
  }

  return profile;
}

export async function requireRoleProfile(supabase: SupabaseClient, expectedRole: AppRole) {
  const profile = await requireCurrentProfile(supabase);

  if (profile.role !== expectedRole) {
    redirect(getDashboardPath(profile.role));
  }

  return profile;
}
