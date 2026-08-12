const indiaTimeZone = "Asia/Kolkata";

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: indiaTimeZone,
  weekday: "long",
});

const datePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: indiaTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getIndiaDate(value = new Date()) {
  return datePartsFormatter.format(value);
}

export function formatDateForDisplay(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  const dateValue =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : getIndiaDate(new Date(value));
  const [year, month, day] = dateValue.split("-");

  return year && month && day ? `${day}-${month}-${year}` : String(value);
}

export function formatDateTimeForDisplay(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const formattedDate = formatDateForDisplay(date);
  const formattedTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: indiaTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .toLowerCase();

  return `${formattedDate}, ${formattedTime}`;
}

export function getIndiaWeekday(value = new Date()) {
  return weekdayFormatter.format(value).toLowerCase();
}

export function getUtcRangeForIndiaDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, -5, -30, 0, 0));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function getUtcRangeForIndiaDateRange(
  dateFrom: string,
  dateTo: string,
): { start?: string; end?: string } {
  if (!dateFrom && !dateTo) {
    return {};
  }

  if (!dateFrom) {
    return { end: getUtcRangeForIndiaDate(dateTo).end };
  }

  if (!dateTo) {
    return { start: getUtcRangeForIndiaDate(dateFrom).start };
  }

  const startDate = dateFrom <= dateTo ? dateFrom : dateTo;
  const endDate = dateFrom <= dateTo ? dateTo : dateFrom;

  return {
    start: getUtcRangeForIndiaDate(startDate).start,
    end: getUtcRangeForIndiaDate(endDate).end,
  };
}

export function getWholeDayDifference(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();

  return Math.floor((end - start) / 86_400_000);
}
