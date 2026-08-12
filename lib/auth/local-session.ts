import type { AppRole, UserProfile } from "@/types/domain";
import { isAppRole } from "./routing";

export const localSessionCookieName = "mm-next-local-profile";

export const localDemoUsers: UserProfile[] = [
  {
    id: "local-admin",
    fullName: "Local Admin",
    role: "admin",
    loginId: "admin",
    active: true,
    geofenceMeters: 100,
  },
  {
    id: "local-manager",
    fullName: "Local Manager",
    role: "manager",
    loginId: "manager",
    active: true,
    geofenceMeters: 100,
  },
  {
    id: "local-sales",
    fullName: "Local Sales",
    role: "sales",
    loginId: "sales",
    active: true,
    geofenceMeters: 100,
  },
];

type LocalProfileCookie = {
  id: string;
  fullName: string;
  role: AppRole;
  loginId: string;
  geofenceMeters: number | null;
};

export function getLocalDemoUser(loginId: string) {
  return localDemoUsers.find((user) => user.loginId === loginId.trim().toLowerCase()) || null;
}

export function serializeLocalProfile(profile: UserProfile) {
  const value: LocalProfileCookie = {
    id: profile.id,
    fullName: profile.fullName,
    role: profile.role,
    loginId: profile.loginId,
    geofenceMeters: profile.geofenceMeters,
  };

  return encodeURIComponent(JSON.stringify(value));
}

export function parseLocalProfile(value: string | undefined): UserProfile | null {
  if (!value) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(decodeURIComponent(value)) as Partial<LocalProfileCookie>;

    if (
      !parsedValue.id ||
      !parsedValue.fullName ||
      !parsedValue.loginId ||
      !isAppRole(parsedValue.role)
    ) {
      return null;
    }

    return {
      id: parsedValue.id,
      fullName: parsedValue.fullName,
      role: parsedValue.role,
      loginId: parsedValue.loginId,
      active: true,
      geofenceMeters: parsedValue.geofenceMeters ?? null,
    };
  } catch {
    return null;
  }
}
