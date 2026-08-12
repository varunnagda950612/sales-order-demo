"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  CircleDollarSign,
  CalendarClock,
  ClipboardList,
  Crosshair,
  MapPinned,
  PackageSearch,
  ShoppingBag,
  Store,
  Target,
  ArrowUp,
  Activity,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SyncHealthNavBadge } from "@/components/sync/sync-health-nav-badge";
import { getTabsForRole } from "@/lib/constants/navigation";
import type { AppRole, UserProfile } from "@/types/domain";

type RoleDashboardProps = {
  profile: UserProfile;
  children?: React.ReactNode;
};

const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  sales: "Sales",
};

const tabIcons: Record<string, LucideIcon> = {
  orders: ClipboardList,
  collections: CircleDollarSign,
  "visit-status": Crosshair,
  "day-log": CalendarClock,
  targets: Target,
  shops: Store,
  products: PackageSearch,
  "gps-route": MapPinned,
  users: UsersRound,
  "sync-health": Activity,
  "adhoc-order": ShoppingBag,
};

function getTabHref(role: AppRole, tabId: string) {
  if (role === "sales") {
    if (tabId === "shops") {
      return "/sales";
    }

    return `/sales/${tabId}`;
  }

  if (tabId === "orders") {
    return `/${role}`;
  }

  return `/${role}/${tabId}`;
}

function getActiveTabLabel(pathname: string, role: AppRole) {
  const tabs = getTabsForRole(role);
  return (
    tabs.find((tab) => getTabHref(role, tab.id) === pathname)?.label ||
    "Workspace"
  );
}

function AppNavigation({
  role,
  pathname,
  mobile = false,
  onNavigate,
}: {
  role: AppRole;
  pathname: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const tabs = getTabsForRole(role);

  return (
    <nav aria-label={`${roleLabels[role]} sections`}>
      <ul className="space-y-1">
        {tabs.map((tab) => {
          const href = getTabHref(role, tab.id);
          const isActive = pathname === href;
          const Icon = tabIcons[tab.id] || ClipboardList;

          return (
            <li key={tab.id}>
              <Link
                href={href}
                prefetch={false}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={`group inline-flex items-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                  mobile ? "w-full px-3 py-3" : "w-full px-3 py-2.5"
                } ${
                  isActive
                    ? "bg-orange-600 text-white shadow-sm"
                    : "text-stone-600 hover:bg-orange-50 hover:text-orange-800"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{tab.label}</span>
                {tab.id === "sync-health" ? (
                  <SyncHealthNavBadge active={isActive} />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileMenuToggle({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
        isOpen
          ? "border-orange-600 bg-orange-600 text-white shadow-sm"
          : "border-stone-200 bg-white text-stone-800 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
      }`}
      aria-label={isOpen ? "Close navigation" : "Open navigation"}
      aria-expanded={isOpen}
      aria-controls="mobile-navigation-drawer"
    >
      <span
        className={`absolute left-2.5 top-3 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out ${
          isOpen ? "translate-y-2 rotate-45" : ""
        }`}
      />
      <span
        className={`absolute left-2.5 top-1/2 h-0.5 w-5 -translate-y-1/2 rounded-full bg-current transition-all duration-200 ease-out ${
          isOpen ? "scale-x-0 opacity-0" : ""
        }`}
      />
      <span
        className={`absolute bottom-3 left-2.5 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out ${
          isOpen ? "-translate-y-2 -rotate-45" : ""
        }`}
      />
    </button>
  );
}

function MobileNavigationDrawer({
  profile,
  pathname,
  isOpen,
  onClose,
}: {
  profile: UserProfile;
  pathname: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { role } = profile;

  return (
    <div
      className={`fixed inset-0 z-50 lg:hidden ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close navigation"
        tabIndex={isOpen ? 0 : -1}
        className={`absolute inset-0 bg-stone-950/40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        id="mobile-navigation-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        inert={!isOpen}
        className={`relative flex h-full w-72 flex-col bg-white shadow-2xl transition-transform duration-300 ease-out sm:w-80 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-4">
          <MobileMenuToggle isOpen onClick={onClose} />
          <Image
            src="/icons/manish-logo-app.png"
            alt="Manish Masala Sales Order Demo"
            width={1422}
            height={951}
            priority
            className="h-12 w-auto object-contain object-left"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            {roleLabels[role]} workspace
          </p>
          <AppNavigation
            role={role}
            pathname={pathname}
            mobile
            onNavigate={onClose}
          />
        </div>

        <div className="border-t border-stone-200 p-4">
          <div className="rounded-lg bg-stone-900 p-3 text-stone-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-300">
              Signed in as
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {profile.fullName}
            </p>
            <div className="mt-3">
              <SignOutButton variant="dark" />
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsVisible(window.scrollY > 500);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    // Check once on load also
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-orange-600 text-white shadow-lg shadow-orange-900/20 transition-colors hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}

export function RoleDashboard({ profile, children }: RoleDashboardProps) {
  const { role } = profile;
  const tabs = getTabsForRole(role);
  const pathname = usePathname();
  const activeTabLabel = getActiveTabLabel(pathname, role);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="min-h-screen lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden h-screen flex-col border-r border-stone-200 bg-white lg:sticky lg:top-0 lg:flex">
          <div className="border-b border-stone-200 px-5 py-5">
            <Image
              src="/icons/manish-logo-app.png"
              alt="Manish Masala Sales Order Demo"
              width={1422}
              height={951}
              priority
              className="h-20 w-auto max-w-full object-contain object-left"
            />
          </div>

          <div className="px-3 py-4">
            <AppNavigation role={role} pathname={pathname} />
          </div>

          <div className="mt-auto border-t border-stone-200 p-4">
            <div className="rounded-lg bg-stone-900 p-3 text-stone-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-300">
                {roleLabels[role]} workspace
              </p>
              <p className="mt-1 truncate text-sm font-semibold">
                {profile.fullName}
              </p>
              <div className="mt-3">
                <SignOutButton variant="dark" />
              </div>
            </div>
          </div>
        </aside>

        <MobileNavigationDrawer
          profile={profile}
          pathname={pathname}
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:h-20 lg:px-8">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <div className="lg:hidden">
                  <MobileMenuToggle
                    isOpen={isMobileMenuOpen}
                    onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
                  />
                </div>
                <Image
                  src="/icons/manish-logo-app.png"
                  alt="Manish Masala Sales Order Demo"
                  width={1422}
                  height={951}
                  priority
                  className="h-11 w-auto object-contain object-left sm:h-12 lg:hidden"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
                    {roleLabels[role]} workspace
                  </p>
                  <h1 className="truncate text-lg font-bold text-stone-900 sm:text-xl">
                    {activeTabLabel}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="hidden max-w-64 truncate text-sm font-medium text-stone-600 lg:block">
                  {profile.fullName}
                </p>
              </div>
            </div>
          </header>

          <section className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            {children || (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {tabs.map((tab) => {
                  const Icon = tabIcons[tab.id] || ClipboardList;

                  return (
                    <section
                      key={tab.id}
                      id={tab.id}
                      className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
                      aria-labelledby={`${tab.id}-title`}
                    >
                      <Icon
                        className="h-5 w-5 text-orange-600"
                        aria-hidden="true"
                      />
                      <h2
                        id={`${tab.id}-title`}
                        className="mt-4 text-lg font-bold text-stone-900"
                      >
                        {tab.label}
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {tab.description}
                      </p>
                    </section>
                  );
                })}
              </div>
            )}
          </section>
          <ScrollToTopButton />
        </div>
      </div>
    </main>
  );
}
