import type { AppRole } from "@/types/domain";

export const loginPath = "/login";

export function getDashboardPath(role: AppRole) {
  return role === "sales" ? "/sales" : `/${role}`;
}

export function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "manager" || value === "sales";
}
