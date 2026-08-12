"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Coffee, Download, LogOut, MapPin, Play, RotateCcw } from "lucide-react";
import { downloadBlob, fileSafe, personFileSafe } from "@/lib/browser/download";
import { formatDateForDisplay, getIndiaDate } from "@/lib/dates/india";
import { readLocalSalesDaySessions } from "@/lib/local/sales-day-sessions";
import { readLocalUsers } from "@/lib/local/users";
import { getGoogleMapsPointUrl } from "@/lib/maps/google";
import type { SalesDaySession, UserProfile } from "@/types/domain";

type AdminDayLogProps = {
  initialSessions?: SalesDaySession[];
  initialUsers?: UserProfile[];
};

const statusLabels = {
  active: "Active",
  on_break: "Lunch break",
  ended: "Ended",
  not_started: "Not started",
} as const;

type DayLogStatus = keyof typeof statusLabels;

export type DayLogReportRow = {
  date: string;
  user: UserProfile;
  session: SalesDaySession | null;
  status: DayLogStatus;
  workTime: string;
  lunchTime: string;
};

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(value))
    .toLowerCase();
}

function formatDuration(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) {
    return "-";
  }

  const minutes = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
  );
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return hours ? `${hours} hr ${remainingMinutes} min` : `${remainingMinutes} min`;
}

function getStatusClass(status: DayLogStatus) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "on_break") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  if (status === "ended") {
    return "border-stone-200 bg-stone-100 text-stone-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

function getDateRange(fromDate: string, toDate: string) {
  if (!fromDate || !toDate || fromDate > toDate) {
    return [];
  }

  const dates: string[] = [];
  const [fromYear, fromMonth, fromDay] = fromDate.split("-").map(Number);
  const [toYear, toMonth, toDay] = toDate.split("-").map(Number);
  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const end = new Date(Date.UTC(toYear, toMonth - 1, toDay));

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function getWorkEnd(session: SalesDaySession | null, workDate: string) {
  if (!session) {
    return null;
  }

  if (session.endedAt) {
    return session.endedAt;
  }

  return workDate === getIndiaDate() ? new Date().toISOString() : null;
}

function TimeLocationLink({
  label,
  value,
  latitude,
  longitude,
  accuracy,
}: {
  label: string;
  value: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  accuracy: number | null | undefined;
}) {
  const time = formatTime(value);

  if (time === "-") {
    return <span>-</span>;
  }

  const mapUrl = getGoogleMapsPointUrl(latitude ?? null, longitude ?? null);

  if (!mapUrl) {
    return (
      <span title={`${label} GPS was not captured.`}>
        {time}
      </span>
    );
  }

  return (
    <a
      href={mapUrl}
      target="_blank"
      rel="noreferrer"
      title={`${label} location${accuracy ? `, accuracy ${Math.round(accuracy)} m` : ""}`}
      className="inline-flex items-center gap-1 font-bold text-orange-700 underline-offset-4 transition-colors hover:text-orange-800 hover:underline"
    >
      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{time}</span>
    </a>
  );
}

export function AdminDayLog({
  initialSessions,
  initialUsers,
}: AdminDayLogProps) {
  const today = getIndiaDate();
  const [selectedFromDate, setSelectedFromDate] = useState(today);
  const [selectedToDate, setSelectedToDate] = useState(today);
  const [selectedSalesperson, setSelectedSalesperson] = useState("all");
  const [downloadMessage, setDownloadMessage] = useState("");
  const sessions = initialSessions || readLocalSalesDaySessions();
  const users = (initialUsers || readLocalUsers()).filter(
    (user) => user.role === "sales" && user.active,
  );
  const dateRange = useMemo(
    () => getDateRange(selectedFromDate, selectedToDate),
    [selectedFromDate, selectedToDate],
  );
  const selectedSalespersonName = useMemo(() => {
    if (selectedSalesperson === "all") {
      return "All salespeople";
    }

    return users.find((user) => user.id === selectedSalesperson)?.fullName || "Salesperson";
  }, [selectedSalesperson, users]);
  const sessionByUserAndDate = useMemo(() => {
    const sessionMap = new Map<string, SalesDaySession>();

    sessions.forEach((session) => {
      if (session.workDate >= selectedFromDate && session.workDate <= selectedToDate) {
        sessionMap.set(`${session.salesPersonId}:${session.workDate}`, session);
      }
    });

    return sessionMap;
  }, [selectedFromDate, selectedToDate, sessions]);
  const visibleUsers = useMemo(
    () =>
      users
        .filter((user) => selectedSalesperson === "all" || user.id === selectedSalesperson)
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [selectedSalesperson, users],
  );
  const rows = useMemo<DayLogReportRow[]>(
    () =>
      dateRange.flatMap((date) =>
        visibleUsers.map((user) => {
          const session = sessionByUserAndDate.get(`${user.id}:${date}`) || null;
          const status = session?.status || "not_started";

          return {
            date,
            user,
            session,
            status,
            lunchTime: formatDuration(session?.lunchStartedAt, session?.lunchEndedAt),
            workTime: session ? formatDuration(session.startedAt, getWorkEnd(session, date)) : "-",
          };
        }),
      ),
    [dateRange, sessionByUserAndDate, visibleUsers],
  );
  const summary = useMemo(
    () => ({
      totalSalespeople: visibleUsers.length,
      days: dateRange.length,
      active: rows.filter((row) => row.status === "active").length,
      onBreak: rows.filter((row) => row.status === "on_break").length,
      ended: rows.filter((row) => row.status === "ended").length,
      notStarted: rows.filter((row) => row.status === "not_started").length,
    }),
    [dateRange.length, rows, visibleUsers.length],
  );
  const isDateRangeValid =
    Boolean(selectedFromDate) &&
    Boolean(selectedToDate) &&
    selectedFromDate <= selectedToDate;

  async function handleDownloadReport() {
    if (!isDateRangeValid) {
      setDownloadMessage("Select a valid date range.");
      return;
    }

    const { buildDayLogPdf } = await import("@/lib/pdf/day-log-report");
    const pdfBlob = buildDayLogPdf({
      rows,
      titleParts: [
        selectedSalespersonName,
        `${formatDateForDisplay(selectedFromDate)} to ${formatDateForDisplay(selectedToDate)}`,
      ],
      summary,
    });
    const dateLabel =
      selectedFromDate === selectedToDate
        ? formatDateForDisplay(selectedFromDate)
        : `${formatDateForDisplay(selectedFromDate)}_to_${formatDateForDisplay(selectedToDate)}`;
    const filename = `${personFileSafe(selectedSalespersonName)}-day-log_${fileSafe(dateLabel)}.pdf`;

    downloadBlob(pdfBlob, filename);
    setDownloadMessage("Day log PDF downloaded.");
  }

  return (
    <section className="space-y-4" aria-labelledby="day-log-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-orange-700">Attendance</p>
            <h2 id="day-log-title" className="mt-1 text-2xl font-bold text-stone-900">
              Day Log
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              Track salesperson start day, lunch break, resume, and end day status.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CalendarClock className="hidden h-8 w-8 text-orange-600 sm:block" aria-hidden="true" />
            <button
              type="button"
              disabled={!rows.length || !isDateRangeValid}
              onClick={handleDownloadReport}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
              Download Report
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">From date</span>
            <input
              type="date"
              max={today}
              value={selectedFromDate}
              onChange={(event) => setSelectedFromDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">To date</span>
            <input
              type="date"
              max={today}
              value={selectedToDate}
              onChange={(event) => setSelectedToDate(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-stone-700">Salesperson</span>
            <select
              value={selectedSalesperson}
              onChange={(event) => setSelectedSalesperson(event.target.value)}
              className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 transition-colors focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100"
            >
              <option value="all">All salespeople</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!isDateRangeValid ? (
          <p className="mt-3 text-sm font-semibold text-red-700" role="alert">
            From date cannot be after To date.
          </p>
        ) : null}
        {downloadMessage ? (
          <p className="mt-3 text-sm text-stone-600" role="status">
            {downloadMessage}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-stone-500">Salespeople</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{summary.totalSalespeople}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-stone-500">Days</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{summary.days}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-emerald-700">Active</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{summary.active}</p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-sky-700">Lunch break</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{summary.onBreak}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-stone-500">Ended</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{summary.ended}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase text-amber-700">Not started</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{summary.notStarted}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
          <h3 className="font-bold text-stone-900">
            {formatDateForDisplay(selectedFromDate)} to {formatDateForDisplay(selectedToDate)} day status
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="bg-stone-100 text-stone-700">
              <tr>
                <th className="w-12 px-3 py-3 font-bold">No.</th>
                <th className="w-32 px-3 py-3 font-bold">Date</th>
                <th className="min-w-48 px-3 py-3 font-bold">Salesperson</th>
                <th className="w-32 px-3 py-3 font-bold">Status</th>
                <th className="w-28 px-3 py-3 font-bold">Start</th>
                <th className="w-28 px-3 py-3 font-bold">Lunch</th>
                <th className="w-28 px-3 py-3 font-bold">Resume</th>
                <th className="w-28 px-3 py-3 font-bold">End</th>
                <th className="w-32 px-3 py-3 font-bold">Lunch time</th>
                <th className="w-32 px-3 py-3 font-bold">Work time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                return (
                  <tr key={`${row.user.id}:${row.date}`} className="border-t border-stone-200">
                    <td className="px-3 py-3 text-center font-bold text-stone-700">
                      {index + 1}
                    </td>
                    <td className="px-3 py-3 font-medium text-stone-800">
                      {formatDateForDisplay(row.date)}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-bold text-stone-900">{row.user.fullName}</p>
                      <p className="mt-1 text-xs text-stone-500">{row.user.loginId}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${getStatusClass(row.status)}`}>
                        {row.status === "active" ? (
                          <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : row.status === "on_break" ? (
                          <Coffee className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : row.status === "ended" ? (
                          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {statusLabels[row.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-stone-800">
                      <TimeLocationLink
                        label="Start"
                        value={row.session?.startedAt}
                        latitude={row.session?.startLat}
                        longitude={row.session?.startLng}
                        accuracy={row.session?.startAccuracy}
                      />
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      <TimeLocationLink
                        label="Lunch break"
                        value={row.session?.lunchStartedAt}
                        latitude={row.session?.lunchStartLat}
                        longitude={row.session?.lunchStartLng}
                        accuracy={row.session?.lunchStartAccuracy}
                      />
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      <TimeLocationLink
                        label="Resume"
                        value={row.session?.lunchEndedAt}
                        latitude={row.session?.lunchEndLat}
                        longitude={row.session?.lunchEndLng}
                        accuracy={row.session?.lunchEndAccuracy}
                      />
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      <TimeLocationLink
                        label="End"
                        value={row.session?.endedAt}
                        latitude={row.session?.endLat}
                        longitude={row.session?.endLng}
                        accuracy={row.session?.endAccuracy}
                      />
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      {row.lunchTime}
                    </td>
                    <td className="px-3 py-3 text-stone-700">
                      {row.workTime}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
