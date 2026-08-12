import type {
  LocalCollection,
  PaymentMode,
  SalesRouteShop,
  UserProfile,
} from "@/types/domain";

export type CollectionPdfRow = {
  collectionId: string;
  shopId: string;
  salesPersonId: string;
  collectionType: LocalCollection["collectionType"];
  notes: string;
  billDate: string;
  billNumber: string;
  chequeDate: string | null;
  amount: number;
  discount: number;
  replacement: number;
  paymentMode: PaymentMode;
  createdAt: string;
};

type BuildCollectionsPdfInput = {
  rows: CollectionPdfRow[];
  titleParts: string[];
  shops: SalesRouteShop[];
  users: UserProfile[];
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
    return "";
  }

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}-${month}-${year}`;
}

function compactPdfAmount(value = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) {
    return "Rs. 0";
  }

  return `Rs. ${Math.round(number).toLocaleString("en-IN")}`;
}

function rowText(value: unknown, maxChars: number) {
  const text = String(value ?? "");
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}.` : text;
}

export function buildCollectionsPdf({
  rows,
  titleParts,
  shops,
}: BuildCollectionsPdfInput) {
  const pageWidth = 419.53;
  const pageHeight = 595.28;
  const margin = 12;
  const top = pageHeight - margin - 38;
  const bottom = margin;
  const pages: string[] = [];
  let commands: string[] = [];
  let y = top;
  const shopById = new Map(shops.map((shop) => [shop.id, shop]));
  const columns = [
    { label: "No.", x: 0 },
    { label: "Shop Name", x: 14 },
    { label: "Bill No.", x: 142 },
    { label: "Bill Dt", x: 178 },
    { label: "Cheque", x: 222 },
    { label: "Amount", x: 266 },
    { label: "Disc.", x: 308 },
    { label: "Repl.", x: 332 },
    { label: "Note", x: 356 },
  ];
  const amountColumnIndex = 5;
  const paymentSections: Array<{ mode: PaymentMode; label: string }> = [
    { mode: "cash", label: "Cash" },
    { mode: "cheque", label: "Cheque" },
    { mode: "upi", label: "UPI" },
  ];

  function cmd(value: string) {
    commands.push(value);
  }

  function drawText(text: string, x: number, yPos: number, size = 9, bold = false, color = "0 0 0") {
    cmd(
      `${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${yPos.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`,
    );
  }

  function drawRect(x: number, yPos: number, width: number, height: number, stroke = "0.42 0.42 0.42 RG", fill = "") {
    cmd(
      `q ${fill ? `${fill} rg ` : ""}${stroke} ${x.toFixed(2)} ${yPos.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill ? "B" : "S"} Q`,
    );
  }

  function drawVerticalColumnLines(yBottom: number, height: number, stroke = "0.42 0.42 0.42 RG") {
    columns.slice(1).forEach((column) => {
      const x = margin + column.x;
      cmd(
        `q ${stroke} 0.6 w ${x.toFixed(2)} ${yBottom.toFixed(2)} m ${x.toFixed(2)} ${(yBottom + height).toFixed(2)} l S Q`,
      );
    });
  }

  function newPage() {
    if (commands.length) {
      pages.push(commands.join("\n"));
    }
    commands = [];
    y = top;
    drawText("Manish Masala Demo Collections", margin, pageHeight - margin, 14, true);
    drawText(
      rowText(
        `${titleParts.join(" | ")} | ${rows.length} bill row${rows.length === 1 ? "" : "s"}`,
        72,
      ),
      margin,
      pageHeight - margin - 14,
      9,
      true,
    );
  }

  function ensureSpace(height: number) {
    if (y - height < bottom) {
      newPage();
    }
  }

  function ensureTableSpace(height: number) {
    if (y - height < bottom) {
      newPage();
      drawTableHeader();
    }
  }

  function drawTableHeader() {
    ensureSpace(26);
    drawRect(margin, y - 16, pageWidth - margin * 2, 18, "0.48 0.36 0.12 RG", "1 0.93 0.64");
    drawVerticalColumnLines(y - 16, 18, "0.48 0.36 0.12 RG");
    columns.forEach((column) => {
      drawText(column.label, margin + column.x + 1, y - 9, 6.4, true);
    });
    y -= 20;
  }

  function drawPaymentSectionHeader(label: string, sectionRows: CollectionPdfRow[]) {
    const sectionTotal = sectionRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    ensureSpace(44);
    drawRect(
      margin,
      y - 14,
      pageWidth - margin * 2,
      16,
      "0.85 0.36 0.02 RG",
      "1 0.95 0.82",
    );
    drawText(
      `${label} - ${sectionRows.length} bill${sectionRows.length === 1 ? "" : "s"}`,
      margin + 6,
      y - 9,
      8,
      true,
      "0.65 0.24 0.01",
    );
    drawText(
      compactPdfAmount(sectionTotal),
      pageWidth - margin - 72,
      y - 9,
      8,
      true,
      "0.65 0.24 0.01",
    );
    y -= 19;
  }

  function drawRow(row: CollectionPdfRow, rowNumber: number, options: { showNumber?: boolean; showShopName?: boolean } = {}) {
    const { showNumber = true, showShopName = true } = options;
    ensureTableSpace(18);
    const shop = shopById.get(row.shopId);
    drawRect(margin, y - 14, pageWidth - margin * 2, 16);
    drawVerticalColumnLines(y - 14, 16);
    const values = [
      showNumber ? rowNumber : "",
      showShopName ? rowText(shop?.name || "Deleted shop", 25) : "",
      rowText(row.billNumber, 8),
      compactPdfDate(row.billDate),
      row.paymentMode === "cheque" ? compactPdfDate(row.chequeDate || "") || "-" : "-",
      compactPdfAmount(row.amount),
      compactPdfAmount(row.discount),
      compactPdfAmount(row.replacement),
      rowText(row.notes || "-", 4),
    ];

    values.forEach((value, valueIndex) => {
      drawText(String(value), margin + columns[valueIndex].x + 1, y - 9, 6.4, true);
    });

    if (row.collectionType === "adhoc") {
      drawRect(margin + columns[1].x + 104, y - 12, 24, 10, "0.63 0.36 0.03 RG", "1 0.86 0.48");
      drawText("ADHOC", margin + columns[1].x + 106, y - 9, 5.4, true);
    }
    y -= 17;
  }

  function drawInlineTotalRow(label: string, amount: number, color = "0.02 0.3 0.42") {
    ensureTableSpace(18);
    const amountColumn = columns[amountColumnIndex];
    const nextColumn = columns[amountColumnIndex + 1];
    const amountX = margin + amountColumn.x;
    const amountWidth =
      (nextColumn?.x ?? pageWidth - margin * 2) - amountColumn.x;

    drawRect(margin, y - 14, pageWidth - margin * 2, 16, "0.42 0.42 0.42 RG", "0.94 0.98 1");
    drawRect(amountX, y - 14, amountWidth, 16, "0.42 0.42 0.42 RG");
    drawText(
      label,
      margin + columns[1].x + 50,
      y - 9,
      7.8,
      true,
      color,
    );
    drawText(
      compactPdfAmount(amount),
      margin + columns[amountColumnIndex].x + 1.5,
      y - 9,
      7.8,
      true,
      color,
    );
    y -= 17;
  }

  function drawShopModeTotalRow(mode: PaymentMode, rowsForTotal: CollectionPdfRow[]) {
    if (rowsForTotal.length <= 1) {
      return;
    }

    const amount = rowsForTotal.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const label =
      mode === "upi"
        ? "UPI shop total"
        : `${mode.charAt(0).toUpperCase()}${mode.slice(1)} shop total`;

    drawInlineTotalRow(label, amount, "0.12 0.32 0.16");
  }

  function groupRowsByChequeDate(rowsForShop: CollectionPdfRow[]) {
    const groups: Array<{
      chequeDate: string;
      rows: CollectionPdfRow[];
    }> = [];
    const groupMap = new Map<string, { chequeDate: string; rows: CollectionPdfRow[] }>();

    rowsForShop.forEach((row) => {
      const key = row.chequeDate || "No cheque date";

      if (!groupMap.has(key)) {
        const group = { chequeDate: key, rows: [] };
        groupMap.set(key, group);
        groups.push(group);
      }

      groupMap.get(key)?.rows.push(row);
    });

    return groups;
  }

  function drawModeSummary(totals: Record<PaymentMode, number>) {
    ensureSpace(26);
    const boxGap = 8;
    const boxWidth = (pageWidth - margin * 2 - boxGap * 2) / 3;
    const summaryBoxes = [
      { label: "Cash", amount: compactPdfAmount(totals.cash) },
      { label: "UPI", amount: compactPdfAmount(totals.upi) },
      { label: "Cheque", amount: compactPdfAmount(totals.cheque) },
    ];

    summaryBoxes.forEach((box, index) => {
      const boxX = margin + index * (boxWidth + boxGap);
      drawRect(boxX, y - 18, boxWidth, 20, "0.48 0.36 0.12 RG", "1 0.93 0.64");
      drawText(`${box.label}: ${box.amount}`, boxX + 6, y - 9.5, 8.4, true);
    });

    y -= 25;
  }

  function groupRowsByShop(sectionRows: CollectionPdfRow[]) {
    const groupedRows: Array<{ shopId: string; rows: CollectionPdfRow[] }> = [];
    const shopGroupMap = new Map<string, { shopId: string; rows: CollectionPdfRow[] }>();

    sectionRows.forEach((row) => {
      const key = row.shopId || `missing-${groupedRows.length}`;
      if (!shopGroupMap.has(key)) {
        const group = { shopId: row.shopId, rows: [] };
        shopGroupMap.set(key, group);
        groupedRows.push(group);
      }
      shopGroupMap.get(key)?.rows.push(row);
    });

    return groupedRows;
  }

  newPage();
  if (!rows.length) {
    drawText("No collections found for selected filters.", margin, top, 10);
  } else {
    const paymentTotals: Record<PaymentMode, number> = { cash: 0, upi: 0, cheque: 0 };

    paymentSections.forEach((section) => {
      const sectionRows = rows.filter((row) => row.paymentMode === section.mode);

      if (!sectionRows.length) {
        return;
      }

      drawPaymentSectionHeader(section.label, sectionRows);
      drawTableHeader();
      groupRowsByShop(sectionRows).forEach((group, index) => {
        if (section.mode === "cheque") {
          let renderedRows = 0;

          groupRowsByChequeDate(group.rows).forEach((chequeGroup) => {
            chequeGroup.rows.forEach((row) => {
              drawRow(row, index + 1, {
                showNumber: renderedRows === 0,
                showShopName: renderedRows === 0,
              });
              renderedRows += 1;
              paymentTotals[row.paymentMode] += Number(row.amount || 0);
            });

            if (chequeGroup.rows.length > 1) {
              drawInlineTotalRow(
                `Cheque ${compactPdfDate(chequeGroup.chequeDate)} total`,
                chequeGroup.rows.reduce(
                  (sum, row) => sum + Number(row.amount || 0),
                  0,
                ),
              );
            }
          });
          return;
        }

        group.rows.forEach((row, rowIndex) => {
          drawRow(row, index + 1, {
            showNumber: rowIndex === 0,
            showShopName: rowIndex === 0,
          });
          paymentTotals[row.paymentMode] += Number(row.amount || 0);
        });
        drawShopModeTotalRow(section.mode, group.rows);
      });
      y -= 6;
    });
    drawModeSummary(paymentTotals);
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
