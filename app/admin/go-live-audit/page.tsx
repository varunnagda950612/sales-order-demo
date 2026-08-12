import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminGoLiveAudit } from "@/features/admin/go-live-audit";
import { requireRoleProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminGoLiveAuditPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "admin");

  return (
    <RoleDashboard profile={profile}>
      <AdminGoLiveAudit />
    </RoleDashboard>
  );
}
