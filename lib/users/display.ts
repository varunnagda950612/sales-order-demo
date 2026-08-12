import type { UserProfile } from "@/types/domain";

export function buildUserNameMap(users: UserProfile[]) {
  return new Map(users.map((user) => [user.id, user.fullName]));
}

export function getSalespersonName(userNameById: Map<string, string>, salesPersonId: string | null | undefined) {
  if (!salesPersonId) {
    return "Unassigned";
  }

  return userNameById.get(salesPersonId) || salesPersonId;
}
