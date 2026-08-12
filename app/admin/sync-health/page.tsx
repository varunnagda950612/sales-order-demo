import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminSyncHealth } from "@/features/admin/sync-health";
import { requireRoleProfile } from "@/lib/auth/profile";
import { readSyncHealthDevices } from "@/lib/repositories/sync-health";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminSyncHealthPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "admin");
  const result = await readSyncHealthDevices(supabase);

  return (
    <RoleDashboard profile={profile}>
      <AdminSyncHealth result={result} canDeleteRows />
    </RoleDashboard>
  );
}
