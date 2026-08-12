import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminDataTools } from "@/features/admin/data-tools";
import { requireRoleProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminDataToolsPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "admin");

  return (
    <RoleDashboard profile={profile}>
      <AdminDataTools />
    </RoleDashboard>
  );
}
