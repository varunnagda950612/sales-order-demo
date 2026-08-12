import { RoleDashboard } from "@/components/layout/role-dashboard";
import { AdminProducts } from "@/features/admin/products";
import { getProductsReadProps } from "@/lib/admin/live-read";
import { requireRoleProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ManagerProductsPage() {
  const supabase = await createSupabaseServerClient();
  const profile = await requireRoleProfile(supabase, "manager");
  const productsProps = await getProductsReadProps(supabase);

  return (
    <RoleDashboard profile={profile}>
      <AdminProducts role="manager" {...productsProps} />
    </RoleDashboard>
  );
}
