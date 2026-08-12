"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Navigation, Plus, RotateCcw, Store, Trash2, X } from "lucide-react";
import { deleteLocalShop, readLocalShops, upsertLocalShop } from "@/lib/local/shops";
import { readLocalUsers } from "@/lib/local/users";
import { getGoogleMapsDirectionsUrl } from "@/lib/maps/google";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatDateForDisplay, getIndiaDate } from "@/lib/dates/india";
import { buildUserNameMap, getSalespersonName } from "@/lib/users/display";
import type {
  AppRole,
  AreaRouteSchedule,
  RouteOverride,
  SalesRouteShop,
  ShopVisitDay,
  UserProfile,
} from "@/types/domain";

type AdminShopsProps = {
  role: Extract<AppRole, "admin" | "manager">;
  initialShops?: SalesRouteShop[];
  initialUsers?: UserProfile[];
  initialRouteOverrides?: RouteOverride[];
  initialAreaRouteSchedules?: AreaRouteSchedule[];
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

type ShopDialog = "route-override" | "area-schedule" | "bulk-import" | null;

const routeVisitDays: Exclude<ShopVisitDay, "as_required">[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function formatVisitDay(day: ShopVisitDay | null | undefined) {
  if (!day) {
    return "No visit day";
  }

  return day
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeShopName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getAreaVisitDay(shops: SalesRouteShop[], area: string, fallback: ShopVisitDay | null) {
  const areaKey = area.trim().toLowerCase();
  return shops.find((shop) => shop.area.trim().toLowerCase() === areaKey && shop.visitDay)?.visitDay || fallback;
}

function formatFrequency(value: AreaRouteSchedule["frequency"]) {
  return value === "biweekly" ? "15 days" : "Weekly";
}

function MutationDialogShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-4 py-4">
      <section className="mx-auto w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl" aria-labelledby="shop-tool-title">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <p className="text-sm font-semibold text-amber-700">Shop master</p>
            <h2 id="shop-tool-title" className="mt-1 text-xl font-bold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
            aria-label={`Close ${title}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function RouteOverrideDialog({
  areas,
  salespeople,
  overrides,
  userNameById,
  persistenceEnabled,
  useSupabase,
  onClose,
  onSaved,
}: {
  areas: string[];
  salespeople: UserProfile[];
  overrides: RouteOverride[];
  userNameById: Map<string, string>;
  persistenceEnabled: boolean;
  useSupabase: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [salesPersonId, setSalesPersonId] = useState(salespeople[0]?.id || "");
  const [area, setArea] = useState(areas[0] || "");
  const [overrideDate, setOverrideDate] = useState(getIndiaDate(new Date()));
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleSave() {
    setMessage(null);

    if (!persistenceEnabled) {
      setMessage("Preview mode is active. You can review this form, but saving is disabled.");
      return;
    }

    if (!useSupabase) {
      setMessage("Route overrides are available in Supabase mode.");
      return;
    }

    if (!salesPersonId || !area || !overrideDate) {
      setMessage("Salesperson, area, and date are required.");
      return;
    }

    if (!window.confirm("Save this route override?")) {
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("route_overrides").insert({
        sales_person_id: salesPersonId,
        override_date: overrideDate,
        area,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      onSaved();
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(override: RouteOverride) {
    setMessage(null);

    if (!persistenceEnabled) {
      setMessage("Preview mode is active. Deleting is disabled.");
      return;
    }

    if (!useSupabase) {
      setMessage("Route overrides are available in Supabase mode.");
      return;
    }

    if (!window.confirm("Delete this route override permanently?")) {
      return;
    }

    setDeletingId(override.id);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("route_overrides").delete().eq("id", override.id);

      if (error) {
        setMessage(error.message);
        return;
      }

      onSaved();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <MutationDialogShell
      title="Route Override"
      description="Temporarily shift a salesperson route for one date."
      onClose={onClose}
    >
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Salesperson</span>
          <select value={salesPersonId} onChange={(event) => setSalesPersonId(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
            <option value="">Select salesperson</option>
            {salespeople.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Date</span>
          <input type="date" value={overrideDate} onChange={(event) => setOverrideDate(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-slate-800">Area</span>
          <select value={area} onChange={(event) => setArea(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
            <option value="">Select area</option>
            {areas.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      {message ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
      {!persistenceEnabled ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Preview mode is active. Final save remains disabled.</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" disabled={!persistenceEnabled || isSaving} onClick={handleSave} className="rounded-md bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300">{isSaving ? "Saving" : "Save Override"}</button>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-amber-200">
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="sticky top-0 bg-amber-100 text-slate-900">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Salesperson</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {overrides.length ? (
                overrides.map((override) => (
                  <tr key={override.id} className="border-t border-amber-200">
                    <td className="px-3 py-3">{formatDateForDisplay(override.overrideDate)}</td>
                    <td className="px-3 py-3">{getSalespersonName(userNameById, override.salesPersonId)}</td>
                    <td className="px-3 py-3 font-medium">{override.area}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        disabled={!persistenceEnabled || deletingId === override.id}
                        onClick={() => handleDelete(override)}
                        className="rounded-md bg-red-50 px-3 py-2 font-bold text-red-700 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        {deletingId === override.id ? "Deleting" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-5 text-center text-slate-500">
                    No route overrides found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MutationDialogShell>
  );
}

function AreaScheduleDialog({
  areas,
  salespeople,
  schedules,
  userNameById,
  persistenceEnabled,
  useSupabase,
  onClose,
  onSaved,
}: {
  areas: string[];
  salespeople: UserProfile[];
  schedules: AreaRouteSchedule[];
  userNameById: Map<string, string>;
  persistenceEnabled: boolean;
  useSupabase: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [area, setArea] = useState(areas[0] || "");
  const [salesPersonId, setSalesPersonId] = useState("");
  const [visitDay, setVisitDay] = useState<Exclude<ShopVisitDay, "as_required">>("monday");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly">("weekly");
  const [startDate, setStartDate] = useState(getIndiaDate(new Date()));
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadSchedule(schedule: AreaRouteSchedule) {
    setEditingScheduleId(schedule.id);
    setArea(schedule.area);
    setSalesPersonId(schedule.salesPersonId || "");
    setVisitDay(schedule.visitDay);
    setFrequency(schedule.frequency);
    setStartDate(schedule.startDate);
    setMessage(null);
  }

  function resetForm() {
    setEditingScheduleId(null);
    setArea(areas[0] || "");
    setSalesPersonId("");
    setVisitDay("monday");
    setFrequency("weekly");
    setStartDate(getIndiaDate(new Date()));
  }

  async function handleSave() {
    setMessage(null);

    if (!persistenceEnabled) {
      setMessage("Preview mode is active. You can review this form, but saving is disabled.");
      return;
    }

    if (!useSupabase) {
      setMessage("Area schedules are available in Supabase mode.");
      return;
    }

    if (!area || !visitDay || !startDate) {
      setMessage("Area, visit day, and start date are required.");
      return;
    }

    if (!window.confirm("Save this area schedule?")) {
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const payload = {
        area,
        sales_person_id: salesPersonId || null,
        visit_day: visitDay,
        frequency,
        start_date: startDate,
      };
      const { error } = editingScheduleId
        ? await supabase.from("area_route_schedules").update(payload).eq("id", editingScheduleId)
        : await supabase.from("area_route_schedules").insert(payload);

      if (error) {
        setMessage(error.message);
        return;
      }

      onSaved();
      resetForm();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(schedule: AreaRouteSchedule) {
    setMessage(null);

    if (!persistenceEnabled) {
      setMessage("Preview mode is active. Deleting is disabled.");
      return;
    }

    if (!useSupabase) {
      setMessage("Area schedules are available in Supabase mode.");
      return;
    }

    if (!window.confirm("Delete this area schedule permanently?")) {
      return;
    }

    setDeletingId(schedule.id);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("area_route_schedules").delete().eq("id", schedule.id);

      if (error) {
        setMessage(error.message);
        return;
      }

      if (editingScheduleId === schedule.id) {
        resetForm();
      }
      onSaved();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <MutationDialogShell
      title="Area Schedule"
      description="Set weekly or 15-day route cycles for full areas."
      onClose={onClose}
    >
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Area</span>
          <select value={area} onChange={(event) => setArea(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
            <option value="">Select area</option>
            {areas.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Salesperson</span>
          <select value={salesPersonId} onChange={(event) => setSalesPersonId(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
            <option value="">All / area default</option>
            {salespeople.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Visit day</span>
          <select value={visitDay} onChange={(event) => setVisitDay(event.target.value as Exclude<ShopVisitDay, "as_required">)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
            {routeVisitDays.map((day) => <option key={day} value={day}>{formatVisitDay(day)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Frequency</span>
          <select value={frequency} onChange={(event) => setFrequency(event.target.value as "weekly" | "biweekly")} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-slate-800">Start date</span>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900" />
        </label>
      </div>
      {message ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
      {!persistenceEnabled ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Preview mode is active. Final save remains disabled.</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        {editingScheduleId ? (
          <button type="button" onClick={resetForm} className="rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">Clear Edit</button>
        ) : null}
        <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" disabled={!persistenceEnabled || isSaving} onClick={handleSave} className="rounded-md bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300">{isSaving ? "Saving" : editingScheduleId ? "Update Schedule" : "Add Schedule"}</button>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-amber-200">
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="sticky top-0 bg-amber-100 text-slate-900">
              <tr>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">Salesperson</th>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2">Frequency</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length ? (
                schedules.map((schedule) => (
                  <tr key={schedule.id} className="border-t border-amber-200 align-top">
                    <td className="px-3 py-3 font-medium">{schedule.area}</td>
                    <td className="px-3 py-3">{schedule.salesPersonId ? getSalespersonName(userNameById, schedule.salesPersonId) : "All salespeople"}</td>
                    <td className="px-3 py-3">{formatVisitDay(schedule.visitDay)}</td>
                    <td className="px-3 py-3">{formatFrequency(schedule.frequency)}</td>
                    <td className="px-3 py-3">{formatDateForDisplay(schedule.startDate)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => loadSchedule(schedule)}
                          className="rounded-md bg-amber-50 px-3 py-2 font-bold text-slate-800 shadow-sm hover:bg-amber-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={!persistenceEnabled || deletingId === schedule.id}
                          onClick={() => handleDelete(schedule)}
                          className="rounded-md bg-red-50 px-3 py-2 font-bold text-red-700 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:text-slate-500"
                        >
                          {deletingId === schedule.id ? "Deleting" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-5 text-center text-slate-500">
                    No area schedules found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MutationDialogShell>
  );
}

function BulkImportDialog({
  persistenceEnabled,
  onClose,
  onSaved,
}: {
  persistenceEnabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleImport() {
    setMessage(null);

    if (!persistenceEnabled) {
      setMessage("Preview mode is active. You can review this form, but importing is disabled.");
      return;
    }

    if (!file) {
      setMessage("Choose an Excel file first.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setMessage("Upload an .xlsx Excel file.");
      return;
    }

    if (!window.confirm("Import shops from this Excel file?")) {
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/admin/shops/bulk-import", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { imported?: number; error?: string };

      if (!response.ok) {
        setMessage(result.error || "Unable to import shops.");
        return;
      }

      setMessage(`Imported ${result.imported || 0} shops.`);
      onSaved();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <MutationDialogShell
      title="Bulk Import Shops"
      description="Upload Excel with columns: Shop Name, Salesperson Name, Area Name, and Visit Day."
      onClose={onClose}
    >
      <div className="mt-4 space-y-3">
        <a href="/api/admin/shops/bulk-import" className="inline-flex font-bold text-orange-700 underline underline-offset-4">
          Download shop sample file
        </a>
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Upload Excel file</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="mt-2 w-full rounded-md border border-amber-200 px-3 py-2 text-base text-slate-900"
          />
        </label>
      </div>
      {message ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
      {!persistenceEnabled ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Preview mode is active. Final import remains disabled.</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="button" disabled={!persistenceEnabled || isSaving} onClick={handleImport} className="rounded-md bg-orange-600 px-4 py-2 font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300">{isSaving ? "Importing" : "Import Shops"}</button>
      </div>
    </MutationDialogShell>
  );
}

function matchesSearch(shop: SalesRouteShop, value: string) {
  const searchValue = value.trim().toLowerCase();

  if (!searchValue) {
    return true;
  }

  return shop.name.toLowerCase().includes(searchValue);
}

function ShopEditor({
  shop,
  shops,
  areas,
  salespeople,
  persistenceEnabled,
  useSupabase,
  onClose,
  onSaved,
}: {
  shop?: SalesRouteShop;
  shops: SalesRouteShop[];
  areas: string[];
  salespeople: UserProfile[];
  persistenceEnabled: boolean;
  useSupabase: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editorAreas = useMemo(
    () => Array.from(new Set([...areas, shop?.area].filter((area): area is string => Boolean(area)))).sort(),
    [areas, shop?.area],
  );
  const [name, setName] = useState(shop?.name || "");
  const [phone, setPhone] = useState(shop?.phone || "");
  const [area, setArea] = useState(shop?.area || editorAreas[0] || "");
  const [assignedTo, setAssignedTo] = useState(shop?.assignedTo || salespeople[0]?.id || "");
  const [address, setAddress] = useState(shop?.address || "");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!persistenceEnabled) {
      setMessage("Preview mode is active. Saving is disabled to protect live data.");
      return;
    }

    const normalizedName = normalizeShopName(name);
    const normalizedArea = area.trim().replace(/\s+/g, " ");

    if (!normalizedName || !normalizedArea || !assignedTo) {
      setMessage("Shop name, area, and salesperson are required.");
      return;
    }

    if (shops.some((item) => item.id !== shop?.id && normalizeShopName(item.name) === normalizedName)) {
      setMessage("A shop with this name already exists.");
      return;
    }

    if (!window.confirm(shop ? "Update this shop?" : "Save this shop?")) {
      return;
    }

    setIsSaving(true);
    try {
      const visitDay = getAreaVisitDay(shops, normalizedArea, shop?.visitDay || null);
      const payload = {
        name: name.trim(),
        phone: phone.trim() || null,
        area: normalizedArea,
        visit_day: visitDay,
        assigned_to: assignedTo,
        address: address.trim() || null,
      };

      if (useSupabase) {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = shop
          ? await supabase.from("shops").update(payload).eq("id", shop.id).select("id").maybeSingle()
          : await supabase.from("shops").insert(payload).select("id").maybeSingle();

        if (error) {
          setMessage(error.message.includes("shops_normalized_name_unique") ? "A shop with this name already exists." : error.message);
          return;
        }

        if (!data) {
          setMessage("Shop was not saved. Check admin permission and refresh the page.");
          return;
        }
      } else {
        upsertLocalShop({
          id: shop?.id || crypto.randomUUID(),
          name: name.trim(),
          phone: phone.trim() || null,
          area: normalizedArea,
          visitDay,
          assignedTo,
          address: address.trim() || null,
          locationLat: shop?.locationLat ?? null,
          locationLng: shop?.locationLng ?? null,
          locationAccuracy: shop?.locationAccuracy ?? null,
          locationCapturedAt: shop?.locationCapturedAt ?? null,
          gpsStatus: shop?.gpsStatus || "pending",
          visitOutcome: shop?.visitOutcome || "not_visited",
          isOverride: shop?.isOverride || false,
          routeReason: shop?.routeReason || "shop_visit_day",
        });
      }

      onSaved();
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-4 py-4">
      <section className="mx-auto w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl" aria-labelledby="shop-editor-title">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <p className="text-sm font-semibold text-amber-700">Shop master</p>
            <h2 id="shop-editor-title" className="mt-1 text-xl font-bold text-slate-900">
              {shop ? "Edit Shop" : "Add Shop"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
            aria-label="Close shop editor"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Shop name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Phone</span>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Area</span>
            <select
              value={area}
              onChange={(event) => setArea(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            >
              <option value="">Select area</option>
              {editorAreas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Salesperson</span>
            <select
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            >
              <option value="">Select salesperson</option>
              {salespeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Address</span>
            <textarea
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
        </div>

        {message ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
        {!persistenceEnabled ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Preview mode is active. You can test this form, but saving is disabled to protect live data.</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" disabled={!persistenceEnabled || isSaving} onClick={() => void handleSave()} className="rounded-md bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            {isSaving ? "Saving" : "Save Shop"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function AdminShops({
  role,
  initialShops,
  initialUsers,
  initialRouteOverrides = [],
  initialAreaRouteSchedules = [],
  writesEnabled = true,
  mutationUiEnabled = writesEnabled,
}: AdminShopsProps) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedSalesperson, setSelectedSalesperson] = useState("all");
  const [selectedGpsStatus, setSelectedGpsStatus] = useState<"all" | "saved" | "pending">("all");
  const [editingShop, setEditingShop] = useState<SalesRouteShop | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [activeDialog, setActiveDialog] = useState<ShopDialog>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resettingGpsShopId, setResettingGpsShopId] = useState<string | null>(null);
  const shops = initialShops || readLocalShops(refreshKey);
  const users = initialUsers || readLocalUsers(refreshKey);
  const userNameById = useMemo(() => buildUserNameMap(users), [users]);
  const salespeople = useMemo(() => users.filter((user) => user.role === "sales" && user.active), [users]);
  const canShowMutations = role === "admin";
  const canMutate = role === "admin" && writesEnabled;
  const canOpenMutationUi = role === "admin" && mutationUiEnabled;
  const useSupabase = initialShops !== undefined;
  const areaOptions = useMemo(() => Array.from(new Set(shops.map((shop) => shop.area))).sort(), [shops]);
  const salespersonOptions = useMemo(
    () => Array.from(new Set(shops.map((shop) => shop.assignedTo).filter((value): value is string => Boolean(value))))
      .sort((a, b) => getSalespersonName(userNameById, a).localeCompare(getSalespersonName(userNameById, b))),
    [shops, userNameById],
  );
  const visibleShops = useMemo(
    () =>
      shops
        .filter((shop) => selectedArea === "all" || shop.area === selectedArea)
        .filter((shop) => selectedSalesperson === "all" || shop.assignedTo === selectedSalesperson)
        .filter((shop) => selectedGpsStatus === "all" || shop.gpsStatus === selectedGpsStatus)
        .filter((shop) => matchesSearch(shop, searchValue))
        .sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name)),
    [searchValue, selectedArea, selectedGpsStatus, selectedSalesperson, shops],
  );
  const gpsSavedCount = visibleShops.filter((shop) => shop.gpsStatus === "saved").length;
  const gpsPendingCount = visibleShops.length - gpsSavedCount;

  function handleSaved() {
    setRefreshKey((value) => value + 1);
    if (useSupabase) {
      router.refresh();
    }
  }

  async function handleDelete(shop: SalesRouteShop) {
    if (!window.confirm(`Delete shop "${shop.name}" permanently? Existing orders or collections may block this delete.`)) {
      return;
    }

    if (useSupabase) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("shops").delete().eq("id", shop.id);

      if (error) {
        setMessage(`Shop could not be deleted: ${error.message}`);
        return;
      }
    } else {
      deleteLocalShop(shop.id);
    }

    handleSaved();
  }

  async function handleResetGps(shop: SalesRouteShop) {
    if (!window.confirm(`Reset GPS for "${shop.name}"? The salesperson must save a new location on the next visit.`)) {
      return;
    }

    setMessage(null);
    setResettingGpsShopId(shop.id);

    try {
      if (useSupabase) {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("shops")
          .update({
            location_lat: null,
            location_lng: null,
            location_accuracy: null,
            location_captured_at: null,
          })
          .eq("id", shop.id)
          .select("id")
          .maybeSingle();

        if (error) {
          setMessage(error.message);
          return;
        }

        if (!data) {
          setMessage("GPS reset did not update any shop. Check admin permission and refresh the page.");
          return;
        }
      } else {
        upsertLocalShop({
          ...shop,
          locationLat: null,
          locationLng: null,
          locationAccuracy: null,
          locationCapturedAt: null,
          gpsStatus: "pending",
        });
      }

      setMessage(`GPS reset for ${shop.name}.`);
      handleSaved();
    } finally {
      setResettingGpsShopId(null);
    }
  }

  return (
    <section id="shops" className="space-y-4 scroll-mt-32" aria-labelledby="admin-shops-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">Shop master</p>
            <h2 id="admin-shops-title" className="mt-1 text-2xl font-bold text-stone-900">All Shops - {shops.length}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">Manage assignments, route controls, and GPS anchors.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-stone-500">Visible</p>
              <p className="mt-1 text-xl font-bold text-stone-900">{visibleShops.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-emerald-700">GPS Saved</p>
              <p className="mt-1 text-xl font-bold text-emerald-800">{gpsSavedCount}</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-orange-700">GPS Pending</p>
              <p className="mt-1 text-xl font-bold text-orange-800">{gpsPendingCount}</p>
            </div>
          </div>
        </div>

        {!writesEnabled ? <p className="mt-3 text-sm font-semibold text-amber-700">Changes are disabled while live data is read-only.</p> : null}
        {message ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            {message}
          </p>
        ) : null}

        {canShowMutations ? (
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <button type="button" disabled={!canOpenMutationUi} onClick={() => setIsAdding(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300">
              <Plus className="h-5 w-5" aria-hidden="true" />
              Add Shop
            </button>
            <button type="button" disabled={!canOpenMutationUi} onClick={() => setActiveDialog("route-override")} className="rounded-lg border border-stone-300 bg-white px-4 py-3 font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-stone-400">
              Route Override
            </button>
            <button type="button" disabled={!canOpenMutationUi} onClick={() => setActiveDialog("area-schedule")} className="rounded-lg border border-stone-300 bg-white px-4 py-3 font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-stone-400">
              Area Schedule
            </button>
            <button type="button" disabled={!canOpenMutationUi} onClick={() => setActiveDialog("bulk-import")} className="rounded-lg border border-stone-300 bg-white px-4 py-3 font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-stone-400">
              Bulk Import
            </button>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Salesperson</span>
            <select value={selectedSalesperson} onChange={(event) => setSelectedSalesperson(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
              <option value="all">All salespeople</option>
              {salespersonOptions.map((salesPersonId) => (
                <option key={salesPersonId} value={salesPersonId}>{getSalespersonName(userNameById, salesPersonId)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Area</span>
            <select value={selectedArea} onChange={(event) => setSelectedArea(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
              <option value="all">All areas</option>
              {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Location</span>
            <select value={selectedGpsStatus} onChange={(event) => setSelectedGpsStatus(event.target.value as "all" | "saved" | "pending")} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
              <option value="all">All locations</option>
              <option value="saved">Location saved</option>
              <option value="pending">Location pending</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Search shops</span>
            <input type="search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900" placeholder="Shop name" />
          </label>
        </div>
      </div>

      {visibleShops.length ? (
        <div className="max-h-[70vh] space-y-2 overflow-y-auto rounded-lg border border-stone-200 bg-white p-2 shadow-sm">
          {visibleShops.map((shop) => {
            const mapUrl = getGoogleMapsDirectionsUrl(shop.locationLat, shop.locationLng);
            const hasGps = Boolean(mapUrl);

            return (
              <article key={shop.id} className="rounded-lg border border-stone-200 p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/40">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900">{shop.name}</h3>
                    <p className="text-sm font-semibold text-slate-600">{shop.area}</p>
                    {shop.address ? <p className="mt-1 text-sm text-slate-600">{shop.address}</p> : null}
                  </div>
                  <span className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${hasGps ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    Location {hasGps ? "saved" : "pending"}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                  <p><span className="font-semibold">Salesperson:</span> {getSalespersonName(userNameById, shop.assignedTo)}</p>
                  <p><span className="font-semibold">Phone:</span> {shop.phone || "-"}</p>
                  <p><span className="font-semibold">Route:</span> {formatVisitDay(shop.visitDay)}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {canShowMutations ? (
                    <button type="button" disabled={!canOpenMutationUi} onClick={() => setEditingShop(shop)} className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500">
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </button>
                  ) : null}
                  {mapUrl ? (
                    <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-sm font-bold text-slate-700 hover:bg-slate-50">
                      <Navigation className="h-4 w-4" aria-hidden="true" />
                      Get Direction
                    </a>
                  ) : null}
                  {canShowMutations && hasGps ? (
                    <button type="button" disabled={!canMutate || resettingGpsShopId === shop.id} onClick={() => void handleResetGps(shop)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-500">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      {resettingGpsShopId === shop.id ? "Resetting" : "Reset GPS"}
                    </button>
                  ) : null}
                  {canShowMutations ? (
                    <button type="button" disabled={!canMutate} onClick={() => void handleDelete(shop)} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <Store className="mx-auto h-8 w-8 text-stone-400" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-bold text-stone-900">No shops match these filters</h3>
          <p className="mt-2 text-sm text-stone-600">Change the filters or search text to view other shops.</p>
        </div>
      )}

      {isAdding ? <ShopEditor shops={shops} areas={areaOptions} salespeople={salespeople} persistenceEnabled={canMutate} useSupabase={useSupabase} onClose={() => setIsAdding(false)} onSaved={handleSaved} /> : null}
      {editingShop ? <ShopEditor shop={editingShop} shops={shops} areas={areaOptions} salespeople={salespeople} persistenceEnabled={canMutate} useSupabase={useSupabase} onClose={() => setEditingShop(null)} onSaved={handleSaved} /> : null}
      {activeDialog === "route-override" ? (
        <RouteOverrideDialog
          areas={areaOptions}
          salespeople={salespeople}
          overrides={initialRouteOverrides}
          userNameById={userNameById}
          persistenceEnabled={canMutate}
          useSupabase={useSupabase}
          onClose={() => setActiveDialog(null)}
          onSaved={handleSaved}
        />
      ) : null}
      {activeDialog === "area-schedule" ? (
        <AreaScheduleDialog
          areas={areaOptions}
          salespeople={salespeople}
          schedules={initialAreaRouteSchedules}
          userNameById={userNameById}
          persistenceEnabled={canMutate}
          useSupabase={useSupabase}
          onClose={() => setActiveDialog(null)}
          onSaved={handleSaved}
        />
      ) : null}
      {activeDialog === "bulk-import" ? (
        <BulkImportDialog
          persistenceEnabled={canMutate}
          onClose={() => setActiveDialog(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </section>
  );
}
