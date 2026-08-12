import type { SalesDaySession, UserProfile } from "@/types/domain";

type DayLogPdfStatus = "active" | "on_break" | "ended" | "not_started";

type DayLogPdfRow = {
  date: string;
  user: Pick<UserProfile, "fullName" | "loginId">;
  session:
    | Pick<
        SalesDaySession,
        "startedAt" | "lunchStartedAt" | "lunchEndedAt" | "endedAt"
      >
    | null;
  status: DayLogPdfStatus;
  workTime: string;
  lunchTime: string;
};

type DayLogPdfSummary = {
  totalSalespeople: number;
  days: number;
  active: number;
  onBreak: number;
  ended: number;
  notStarted: number;
};

type BuildDayLogPdfInput = {
  rows: DayLogPdfRow[];
  titleParts: string[];
  summary: DayLogPdfSummary;
};

const statusLabels: Record<DayLogPdfStatus, string> = {
  active: "Active",
  on_break: "Lunch",
  ended: "Ended",
  not_started: "Not started",
};

function pdfEscape(value = "") {
  return String(value)
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function compactPdfDate(value = "") {
  if (!value) {
    return "-";
  }

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}-${month}-${year}`;
}

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

function rowText(value: unknown, maxChars: number) {
  const text = String(value ?? "");
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}.` : text;
}

export function buildDayLogPdf({ rows, titleParts, summary }: BuildDayLogPdfInput) {
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 28;
  const top = pageHeight - margin - 54;
  const bottom = margin;
  const pages: string[] = [];
  const columns = [
    { label: "No.", x: 0 },
    { label: "Date", x: 28 },
    { label: "Salesperson", x: 84 },
    { label: "Login", x: 214 },
    { label: "Status", x: 292 },
    { label: "Start", x: 366 },
    { label: "Lunch", x: 424 },
    { label: "Resume", x: 482 },
    { label: "End", x: 540 },
    { label: "Lunch time", x: 598 },
    { label: "Work time", x: 672 },
  ];
  let commands: string[] = [];
  let y = top;

  function cmd(value: string) {
    commands.push(value);
  }

  function drawText(
    text: string,
    x: number,
    yPos: number,
    size = 9,
    bold = false,
    color = "0 0 0",
  ) {
    cmd(
      `${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${yPos.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`,
    );
  }

  function drawRect(
    x: number,
    yPos: number,
    width: number,
    height: number,
    stroke = "0.42 0.42 0.42 RG",
    fill = "",
  ) {
    cmd(
      `q ${fill ? `${fill} rg ` : ""}${stroke} ${x.toFixed(2)} ${yPos.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill ? "B" : "S"} Q`,
    );
  }

  function drawVerticalColumnLines(yBottom: number, height: number) {
    columns.slice(1).forEach((column) => {
      const x = margin + column.x;
      cmd(
        `q 0.42 0.42 0.42 RG 0.5 w ${x.toFixed(2)} ${yBottom.toFixed(2)} m ${x.toFixed(2)} ${(yBottom + height).toFixed(2)} l S Q`,
      );
    });
  }

  function drawSummary() {
    const summaryText = [
      `Salespeople: ${summary.totalSalespeople}`,
      `Days: ${summary.days}`,
      `Active: ${summary.active}`,
      `Lunch: ${summary.onBreak}`,
      `Ended: ${summary.ended}`,
      `Not started: ${summary.notStarted}`,
    ].join("   ");

    drawRect(margin, pageHeight - margin - 44, pageWidth - margin * 2, 18, "0.82 0.62 0.21 RG", "1 0.96 0.82");
    drawText(summaryText, margin + 8, pageHeight - margin - 37, 8.4, true, "0.18 0.16 0.12");
  }

  function newPage() {
    if (commands.length) {
      pages.push(commands.join("\n"));
    }

    commands = [];
    y = top;
    drawText("Manish Masala Demo Day Log", margin, pageHeight - margin, 16, true);
    drawText(
      `${titleParts.join(" | ")} | ${rows.length} row(s)`,
      margin,
      pageHeight - margin - 16,
      10,
      true,
    );
    drawSummary();
  }

  function ensureSpace(height: number) {
    if (y - height < bottom) {
      newPage();
    }
  }

  function drawTableHeader() {
    ensureSpace(24);
    drawRect(margin, y - 16, pageWidth - margin * 2, 18, "0.48 0.36 0.12 RG", "1 0.93 0.64");
    drawVerticalColumnLines(y - 16, 18);
    columns.forEach((column) => {
      drawText(column.label, margin + column.x + 2, y - 9, 7.2, true);
    });
    y -= 20;
  }

  function drawRow(row: DayLogPdfRow, rowNumber: number) {
    ensureSpace(18);
    drawRect(margin, y - 14, pageWidth - margin * 2, 16);
    drawVerticalColumnLines(y - 14, 16);

    const values = [
      rowNumber,
      compactPdfDate(row.date),
      rowText(row.user.fullName, 24),
      rowText(row.user.loginId, 14),
      statusLabels[row.status],
      formatTime(row.session?.startedAt),
      formatTime(row.session?.lunchStartedAt),
      formatTime(row.session?.lunchEndedAt),
      formatTime(row.session?.endedAt),
      row.lunchTime,
      row.workTime,
    ];

    values.forEach((value, valueIndex) => {
      const statusColor =
        valueIndex === 4 && row.status === "active"
          ? "0.02 0.47 0.34"
          : valueIndex === 4 && row.status === "on_break"
            ? "0.04 0.32 0.58"
            : valueIndex === 4 && row.status === "not_started"
              ? "0.62 0.34 0.02"
              : "0 0 0";
      drawText(
        String(value),
        margin + columns[valueIndex].x + 2,
        y - 9,
        7.5,
        valueIndex === 0 || valueIndex === 2 || valueIndex === 4,
        statusColor,
      );
    });

    y -= 17;
  }

  newPage();

  if (!rows.length) {
    drawText("No day log rows found for selected filters.", margin, top, 10);
  } else {
    drawTableHeader();
    rows.forEach((row, index) => drawRow(row, index + 1));
  }

  if (commands.length) {
    pages.push(commands.join("\n"));
  }

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${index * 2 + 5} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  pages.forEach((content, index) => {
    const pageObjectNumber = index * 2 + 5;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}
