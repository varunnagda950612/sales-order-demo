import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminUsers } from "@/features/admin/users";
import { getUsersReadProps } from "@/lib/admin/live-read";
import { requireRoleProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminUsersPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "admin");
  const usersProps = await getUsersReadProps(supabase);

  return (
    <RoleDashboard profile={profile}>
      <AdminUsers role="admin" {...usersProps} />
    </RoleDashboard>
  );
}
