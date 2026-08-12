import type { AppRole, UserProfile } from "@/types/domain";

export const localUsersStorageKey = "manish-masala-next.local-users.v1";

const defaultUsers: UserProfile[] = [
  {
    id: "admin-local-user",
    fullName: "Local Admin",
    role: "admin",
    loginId: "admin",
    active: true,
    geofenceMeters: null,
  },
  {
    id: "manager-local-user",
    fullName: "Local Manager",
    role: "manager",
    loginId: "manager",
    active: true,
    geofenceMeters: null,
  },
  {
    id: "sales-local-user",
    fullName: "Local Salesperson",
    role: "sales",
    loginId: "sales",
    active: true,
    geofenceMeters: 100,
  },
];

export function readLocalUsers(_revision = 0) {
  void _revision;

  if (typeof window === "undefined") {
    return defaultUsers;
  }

  try {
    const rawValue = window.localStorage.getItem(localUsersStorageKey);
    if (!rawValue) {
      return defaultUsers;
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? (parsedValue as UserProfile[]) : defaultUsers;
  } catch {
    return defaultUsers;
  }
}

export function writeLocalUsers(users: UserProfile[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(localUsersStorageKey, JSON.stringify(users));
}

export function upsertLocalUser(user: UserProfile) {
  const users = readLocalUsers().filter((item) => item.id !== user.id);
  writeLocalUsers([...users, user].sort((a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName)));
}

export function deleteLocalUser(userId: string) {
  writeLocalUsers(readLocalUsers().filter((item) => item.id !== userId));
}

export function buildLocalUser(input: {
  existingUser?: UserProfile;
  fullName: string;
  loginId: string;
  role: AppRole;
  active: boolean;
  geofenceMeters: number | null;
}) {
  return {
    id: input.existingUser?.id || crypto.randomUUID(),
    fullName: input.fullName,
    loginId: input.loginId,
    role: input.role,
    active: input.active,
    geofenceMeters: input.geofenceMeters,
  };
}
