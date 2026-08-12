"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Plus, Shield, Trash2, X } from "lucide-react";
import { buildLocalUser, deleteLocalUser, readLocalUsers, upsertLocalUser } from "@/lib/local/users";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppRole, UserProfile } from "@/types/domain";

type AdminUsersProps = {
  role: Extract<AppRole, "admin" | "manager">;
  initialUsers?: UserProfile[];
  writesEnabled?: boolean;
  mutationUiEnabled?: boolean;
};

const roleOptions: AppRole[] = ["admin", "manager", "sales"];

const defaultGeofenceMeters = 100;

async function invokeAdminUserAction(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(data?.error || "Admin user request failed.");
  }

  return data;
}

function toNullableNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue >= 10 && parsedValue <= 1000
    ? parsedValue
    : null;
}

function matchesSearch(user: UserProfile, value: string) {
  const searchValue = value.trim().toLowerCase();

  if (!searchValue) {
    return true;
  }

  return [user.fullName, user.loginId, user.role]
    .filter(Boolean)
    .some((item) => item.toLowerCase().includes(searchValue));
}

function UserEditor({
  user,
  persistenceEnabled,
  useSupabase,
  onClose,
  onSaved,
}: {
  user?: UserProfile;
  persistenceEnabled: boolean;
  useSupabase: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [loginId, setLoginId] = useState(user?.loginId || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>(user?.role || "sales");
  const [active, setActive] = useState(user?.active ?? true);
  const [geofenceMeters, setGeofenceMeters] = useState(
    user?.geofenceMeters === null || user?.geofenceMeters === undefined ? "" : String(user.geofenceMeters),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!persistenceEnabled) {
      setMessage("Preview mode is active. Saving is disabled to protect live data.");
      return;
    }

    const geofenceValue = toNullableNumber(geofenceMeters);

    if (!fullName.trim() || !loginId.trim()) {
      setMessage("Full name and login ID are required.");
      return;
    }

    if (geofenceMeters.trim() && geofenceValue === null) {
      setMessage("Geofence must be a whole number between 10 and 1000.");
      return;
    }

    if (useSupabase && !user && password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (useSupabase && user && password && password.length < 6) {
      setMessage("New password must be at least 6 characters.");
      return;
    }

    if (!window.confirm(user ? "Update this user?" : "Save this user?")) {
      return;
    }

    setIsSaving(true);
    try {
      if (useSupabase) {
        const supabase = createSupabaseBrowserClient();

        if (user) {
          const { error } = await supabase
            .from("profiles")
            .update({
              full_name: fullName.trim(),
              role,
              active,
              geofence_meters:
                geofenceValue ?? user.geofenceMeters ?? defaultGeofenceMeters,
            })
            .eq("id", user.id);

          if (error) {
            setMessage(error.message);
            return;
          }

          if (password) {
            await invokeAdminUserAction({
              action: "reset-password",
              userId: user.id,
              password,
            });
          }
        } else {
          await invokeAdminUserAction({
            action: "create-user",
            name: fullName.trim(),
            loginId: loginId.trim(),
            password,
            role,
            geofenceMeters: geofenceValue ?? defaultGeofenceMeters,
          });
        }
      } else {
        upsertLocalUser(
          buildLocalUser({
            existingUser: user,
            fullName: fullName.trim(),
            loginId: loginId.trim(),
            role,
            active,
            geofenceMeters: geofenceValue,
          }),
        );
      }

      onSaved();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "User could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-4 py-4">
      <section className="mx-auto w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <p className="text-sm font-semibold text-amber-700">Local access setup</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{user ? "Edit User" : "Add User"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
            aria-label="Close user editor"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Login ID</span>
            <input
              type="text"
              value={loginId}
              disabled={useSupabase && Boolean(user)}
              onChange={(event) => setLoginId(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
            {useSupabase && user ? (
              <span className="mt-1 block text-xs text-slate-500">
                Existing live login IDs cannot be changed here.
              </span>
            ) : null}
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">
              {user ? "New password" : "Password"}
            </span>
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              placeholder={user ? "Leave blank to keep current" : ""}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as AppRole)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            >
              {roleOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Geofence meters</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={geofenceMeters}
              onChange={(event) => setGeofenceMeters(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
            />
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm font-semibold text-slate-800">Active user</span>
          </label>
        </div>

        {message ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
        {!persistenceEnabled ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Preview mode is active. You can test this form, but saving is disabled to protect live data.</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!persistenceEnabled || isSaving}
            onClick={() => void handleSave()}
            className="rounded-md bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? "Saving" : "Save User"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function AdminUsers({ role, initialUsers, writesEnabled = true, mutationUiEnabled = writesEnabled }: AdminUsersProps) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [selectedRole, setSelectedRole] = useState<AppRole | "all">("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "active" | "inactive">("all");
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const users = initialUsers || readLocalUsers(refreshKey);
  const canShowMutations = role === "admin";
  const canMutate = role === "admin" && writesEnabled;
  const canOpenMutationUi = role === "admin" && mutationUiEnabled;
  const useSupabase = initialUsers !== undefined;
  const visibleUsers = useMemo(
    () =>
      users
        .filter((user) => selectedRole === "all" || user.role === selectedRole)
        .filter((user) => selectedStatus === "all" || (selectedStatus === "active" ? user.active : !user.active))
        .filter((user) => matchesSearch(user, searchValue)),
    [searchValue, selectedRole, selectedStatus, users],
  );
  const activeCount = visibleUsers.filter((user) => user.active).length;

  function handleSaved() {
    setRefreshKey((value) => value + 1);
    if (useSupabase) {
      router.refresh();
    }
  }

  async function handleDeactivate(user: UserProfile) {
    if (!window.confirm(user.active ? "Deactivate this user?" : "Activate this user?")) {
      return;
    }

    if (!canMutate) {
      return;
    }

    if (useSupabase) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("profiles")
        .update({ active: !user.active })
        .eq("id", user.id);

      if (error) {
        window.alert(`User could not be updated: ${error.message}`);
        return;
      }
    } else {
      upsertLocalUser({ ...user, active: !user.active });
    }

    handleSaved();
  }

  async function handleDelete(user: UserProfile) {
    if (!canMutate) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${user.fullName} permanently?\n\nThis removes the user login and database profile. If the user has orders, collections, visit proofs, or recovery events, deletion will be blocked to protect history.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);

    try {
      if (useSupabase) {
        await invokeAdminUserAction({
          action: "delete-user",
          userId: user.id,
        });
      } else {
        deleteLocalUser(user.id);
      }

      handleSaved();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "User could not be deleted.");
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <section id="users" className="space-y-4 scroll-mt-32" aria-labelledby="admin-users-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">Local user setup</p>
            <h2 id="admin-users-title" className="mt-1 text-2xl font-bold text-stone-900">
              Users
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Local profile workflow for UI validation. This does not create Supabase Auth users or change live access.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-stone-500">Visible</p>
              <p className="mt-1 text-xl font-bold text-stone-900">{visibleUsers.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase text-emerald-700">Active</p>
              <p className="mt-1 text-xl font-bold text-emerald-800">{activeCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_auto] lg:items-end">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Search</span>
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900"
              placeholder="Name, login, role"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Role</span>
            <select
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as AppRole | "all")}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            >
              <option value="all">All</option>
              {roleOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Status</span>
            <select
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value as "all" | "active" | "inactive")}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          {canShowMutations ? (
            <button
              type="button"
              disabled={!canOpenMutationUi}
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              Add User
            </button>
          ) : null}
        </div>
      </div>

      {visibleUsers.length ? (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-full text-left text-sm">
              <thead className="bg-stone-100 text-stone-700">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Geofence</th>
                  <th className="px-3 py-2">Status</th>
                  {canShowMutations ? <th className="px-3 py-2 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.id} className="border-t border-stone-200 transition-colors hover:bg-stone-50">
                    <td className="px-3 py-2">
                      <p className="font-bold text-slate-900">{user.fullName}</p>
                      <p className="text-slate-600">{user.loginId}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                        <Shield className="h-4 w-4" aria-hidden="true" />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-3 py-2">{user.geofenceMeters === null ? "Default" : `${user.geofenceMeters} m`}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-bold ${
                          user.active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {user.active ? "active" : "inactive"}
                      </span>
                    </td>
                    {canShowMutations ? (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={!canOpenMutationUi}
                            onClick={() => setEditingUser(user)}
                            className="inline-flex items-center gap-2 rounded-md border border-amber-300 px-2 py-1 font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-500"
                          >
                            <Edit3 className="h-4 w-4" aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={!canMutate}
                            onClick={() => void handleDeactivate(user)}
                            className="rounded-md border border-slate-300 px-2 py-1 font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-500"
                          >
                            {user.active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            disabled={!canMutate || deletingUserId === user.id}
                            onClick={() => void handleDelete(user)}
                            className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            {deletingUserId === user.id ? "Deleting" : "Delete"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <Shield className="mx-auto h-8 w-8 text-stone-400" aria-hidden="true" />
          <h3 className="mt-3 text-lg font-bold text-stone-900">No local users</h3>
          <p className="mt-2 text-sm text-stone-600">Adjust filters or add a local user row.</p>
        </div>
      )}

      {isAdding ? <UserEditor persistenceEnabled={canMutate} useSupabase={useSupabase} onClose={() => setIsAdding(false)} onSaved={handleSaved} /> : null}
      {editingUser ? (
        <UserEditor user={editingUser} persistenceEnabled={canMutate} useSupabase={useSupabase} onClose={() => setEditingUser(null)} onSaved={handleSaved} />
      ) : null}
    </section>
  );
}
