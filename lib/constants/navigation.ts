import type { AppRole, DashboardTab } from "@/types/domain";

export const adminManagerTabs: DashboardTab[] = [
  {
    id: "orders",
    label: "Orders",
    description: "Route and adhoc order review, edit controls, and PDF export.",
  },
  {
    id: "collections",
    label: "Collections",
    description: "Payment entries, bill rows, mode filters, and collection PDF export.",
  },
  {
    id: "visit-status",
    label: "Visit Status",
    description: "Productive and unproductive route coverage using visit proofs.",
  },
  {
    id: "day-log",
    label: "Day Log",
    description: "Salesperson start day, lunch break, resume, and end day tracking.",
  },
  {
    id: "targets",
    label: "Targets",
    description: "SKU-wise target assignment and salesperson progress tracking.",
  },
  {
    id: "shops",
    label: "Shops",
    description: "Shop master, route schedules, GPS anchors, and route overrides.",
  },
  {
    id: "products",
    label: "Products",
    description: "Product and SKU master with image URL and bulk import support.",
  },
  {
    id: "gps-route",
    label: "GPS Route",
    description: "Admin route timeline, map pins, and reconstructed route paths.",
  },
  {
    id: "users",
    label: "Users",
    description: "Team creation, role management, geofence settings, and password reset.",
  },
  {
    id: "sync-health",
    label: "Sync Health",
    description: "Mobile device pending and failed sync visibility.",
  },
];

export const salesTabs: DashboardTab[] = [
  {
    id: "shops",
    label: "My Shops",
    description: "Today route shops, GPS check-in, order start, no-order, and directions.",
  },
  {
    id: "adhoc-order",
    label: "Adhoc Order",
    description: "Urgent orders outside the planned route with clear adhoc tagging.",
  },
  {
    id: "orders",
    label: "My Orders",
    description: "Submitted orders, edit flow, and salesperson PDF sharing.",
  },
  {
    id: "collections",
    label: "Collections",
    description: "Route and adhoc collection entries after completed visit outcomes.",
  },
  {
    id: "targets",
    label: "Targets",
    description: "Assigned SKU targets and completed KG progress.",
  },
];

export function getTabsForRole(role: AppRole) {
  return role === "sales" ? salesTabs : adminManagerTabs;
}
