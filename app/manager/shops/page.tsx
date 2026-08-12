import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminShops } from "@/features/admin/shops";
import { getShopsReadProps } from "@/lib/admin/live-read";
import { requireRoleProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ManagerShopsPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "manager");
  const shopsProps = await getShopsReadProps(supabase);

  return (
    <RoleDashboard profile={profile}>
      <AdminShops role="manager" {...shopsProps} />
    </RoleDashboard>
  );
}
