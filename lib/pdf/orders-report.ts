import type { LocalOrder, SalesRouteShop } from "@/types/domain";
import { getIndiaDate } from "@/lib/dates/india";
import { getTotalKgLabel } from "@/lib/orders/weights";
import { sortOrderItemsForProductDisplay } from "@/lib/products/display-order";

const orderPdfBodyFontSize = 7.0;
const pdfBlue = "0.15 0.39 0.92";
const pdfRed = "0.86 0.15 0.15";
const pdfGreen = "0.02 0.47 0.34";

type PdfLine = {
  text: string;
  bold: boolean;
  color?: string;
  height?: number;
};

type BuildOrderPdfInput = {
  orders: LocalOrder[];
  shops: SalesRouteShop[];
  titleParts: string[];
};

function orderProductLines(order: LocalOrder) {
  return sortOrderItemsForProductDisplay(order.items).map(
    (item) => `${item.skuCode || item.productName} x ${item.quantity} pcs`,
  );
}

function pdfEscape(value = "") {
  return String(value)
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfText(value: string, maxChars: number) {
  const words = String(value || "")
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }
    current = word.length > maxChars ? word.slice(0, maxChars) : word;
  });

  if (current) {
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

function wrapPdfHeaderText(
  value: string,
  options: { firstLineMaxChars?: number; otherLineMaxChars?: number; maxLines?: number } = {},
) {
  const {
    firstLineMaxChars = 18,
    otherLineMaxChars = firstLineMaxChars,
    maxLines = 2,
  } = options;
  const words = String(value || "")
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const lineIndex = lines.length;
    const maxChars = lineIndex === 0 ? firstLineMaxChars : otherLineMaxChars;
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }
    current = word.length > maxChars ? word.slice(0, maxChars) : word;
  });

  if (current) {
    lines.push(current);
  }
  return (lines.length ? lines : [""]).slice(0, maxLines);
}

function buildOrderHeaderLines(
  shopName: string,
  { isContinuation = false, continuesOnNextPage = false } = {},
) {
  const continuationSuffix = isContinuation ? " (cont.)" : "";
  const inlineHeader = `${shopName || "Deleted shop"}${continuationSuffix}`;
  const baseLines = wrapPdfHeaderText(inlineHeader, {
    firstLineMaxChars: 22,
    otherLineMaxChars: 18,
    maxLines: continuesOnNextPage ? 1 : 2,
  });

  if (!continuesOnNextPage) {
    return baseLines;
  }

  return [...baseLines, "Continues on next page"];
}

function formatPdfNoteItems(value = "") {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const normalized = text
    .replace(/\s*,\s*/g, "\n")
    .replace(/\s*[\r\n]+\s*/g, "\n")
    .replace(/\s+/g, " ");
  const itemPattern = /([a-z]+)\s*([0-9]+[a-z]*)\s*(?:[-*x]|\s+)\s*([0-9]+)\s*(?:pcs?|pc)?\b/gi;
  const items: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(normalized)) !== null) {
    items.push(`${match[1]}${match[2]}-${match[3]}pc`);
  }

  if (items.length) {
    return items.join(", ");
  }

  return normalized
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function pdfNoteLines(label: string, value: string, maxChars: number) {
  const formatted = formatPdfNoteItems(value);
  return formatted ? wrapPdfText(`${label}: ${formatted}`, maxChars) : [];
}

function getOrderPdfGroupKey(order: LocalOrder) {
  return [
    order.salesPersonId,
    order.shopId,
    getIndiaDate(new Date(order.createdAt)),
  ].join(":");
}

function getOrderFreshnessTime(order: LocalOrder) {
  return new Date(order.updatedAt || order.createdAt).getTime();
}

function dedupeOrdersForPdf(orders: LocalOrder[]) {
  const orderByGroup = new Map<string, LocalOrder>();

  orders.forEach((order) => {
    const groupKey = getOrderPdfGroupKey(order);
    const existingOrder = orderByGroup.get(groupKey);

    if (
      !existingOrder ||
      getOrderFreshnessTime(order) >= getOrderFreshnessTime(existingOrder)
    ) {
      orderByGroup.set(groupKey, order);
    }
  });

  return Array.from(orderByGroup.values());
}

export function buildOrdersPdf({ orders, shops, titleParts }: BuildOrderPdfInput) {
  const pdfOrders = dedupeOrdersForPdf(orders).sort(
    (firstOrder, secondOrder) =>
      Number(firstOrder.orderType === "adhoc") -
      Number(secondOrder.orderType === "adhoc"),
  );
  const pageWidth = 419.53;
  const pageHeight = 595.28;
  const margin = 20;
  const headerHeight = 32;
  const columnGap = 6;
  const columnCount = 3;
  const cardWidth = (pageWidth - margin * 2 - columnGap * (columnCount - 1)) / columnCount;
  const bottom = margin;
  const top = pageHeight - margin - headerHeight;
  const pages: string[] = [];
  const shopById = new Map(shops.map((shop) => [shop.id, shop]));
  let commands: string[] = [];
  let column = 0;
  let y = top;

  function cmd(value: string) {
    commands.push(value);
  }

  function drawText(text: string, x: number, yPos: number, size = 10, bold = false, color = "0 0 0") {
    cmd(
      `${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${yPos.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`,
    );
  }

  function drawRect(x: number, yPos: number, width: number, height: number, stroke = "0.82 0.84 0.86 RG", fill = "") {
    cmd(
      `q ${fill ? `${fill} rg ` : ""}${stroke} ${x.toFixed(2)} ${yPos.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill ? "B" : "S"} Q`,
    );
  }

  function newPage() {
    if (commands.length) {
      pages.push(commands.join("\n"));
    }
    commands = [];
    column = 0;
    y = top;
    drawText("Manish Masala Orders", margin, pageHeight - margin, 14, true);
    drawText(`${titleParts.join(" | ")} | ${pdfOrders.length} order(s)`, margin, pageHeight - margin - 14, 9, true);
  }

  function nextColumn() {
    column += 1;
    if (column >= columnCount) {
      newPage();
    } else {
      y = top;
    }
  }

  function xForColumn() {
    return margin + column * (cardWidth + columnGap);
  }

  function drawBadge({
    text,
    x,
    yPos,
    width,
    stroke,
    fill,
    textColor = "0 0 0",
  }: {
    text: string;
    x: number;
    yPos: number;
    width: number;
    stroke: string;
    fill: string;
    textColor?: string;
  }) {
    const badgeHeight = 10;
    drawRect(x + cardWidth - width - 4, yPos - badgeHeight + 1, width, badgeHeight, stroke, fill);
    drawText(text, x + cardWidth - width - 1, yPos - 6.2, 6, true, textColor);
  }

  function drawAdhocBadge(x: number, yPos: number) {
    drawBadge({
      text: "ADHOC",
      x,
      yPos,
      width: 27,
      stroke: "0.63 0.36 0.03 RG",
      fill: "1 0.86 0.48",
    });
  }

  function drawUpdatedBadge(x: number, yPos: number) {
    drawBadge({
      text: "Updated",
      x,
      yPos,
      width: 34,
      stroke: "0.75 0.12 0.12 RG",
      fill: "1 0.93 0.93",
      textColor: "0.78 0.08 0.08",
    });
  }

  function drawOrderSegment({
    order,
    shopName,
    contentLines,
    startIndex,
    isContinuation,
  }: {
    order: LocalOrder;
    shopName: string;
    contentLines: PdfLine[];
    startIndex: number;
    isContinuation: boolean;
  }) {
    const lineHeight = 9.6;
    const cardPadding = 4;
    const baseHeaderLines = buildOrderHeaderLines(shopName, { isContinuation });
    let headerLines = baseHeaderLines;
    let headerBlockHeight = 16 + (headerLines.length - 1) * 9;
    const minimumHeight = headerBlockHeight + lineHeight + 8;
    let movedToNextColumnForRoom = false;

    if (y - minimumHeight < bottom) {
      nextColumn();
    }

    let availableBodyHeight = Math.max(0, y - bottom - headerBlockHeight - 8);
    let maxLines = Math.max(1, Math.floor(availableBodyHeight / lineHeight));
    let segmentLines = contentLines.slice(startIndex, startIndex + maxLines);
    let hasContinuation = startIndex + segmentLines.length < contentLines.length;
    let showPageBreakNotice = column === columnCount - 1 && hasContinuation;

    if (
      hasContinuation &&
      segmentLines.length <= 1 &&
      contentLines.length - startIndex > 1
    ) {
      nextColumn();
      movedToNextColumnForRoom = true;
      headerLines = baseHeaderLines;
      headerBlockHeight = 16 + (headerLines.length - 1) * 9;
      availableBodyHeight = Math.max(0, y - bottom - headerBlockHeight - 8);
      maxLines = Math.max(1, Math.floor(availableBodyHeight / lineHeight));
      segmentLines = contentLines.slice(startIndex, startIndex + maxLines);
      hasContinuation = startIndex + segmentLines.length < contentLines.length;
      showPageBreakNotice = column === columnCount - 1 && hasContinuation;
    }

    if (showPageBreakNotice && !movedToNextColumnForRoom) {
      headerLines = buildOrderHeaderLines(shopName, {
        isContinuation,
        continuesOnNextPage: true,
      });
      headerBlockHeight = 16 + (headerLines.length - 1) * 9;
      availableBodyHeight = Math.max(0, y - bottom - headerBlockHeight - 8);
      maxLines = Math.max(1, Math.floor(availableBodyHeight / lineHeight));
      segmentLines = contentLines.slice(startIndex, startIndex + maxLines);
      hasContinuation = startIndex + segmentLines.length < contentLines.length;
    }

    void hasContinuation;
    const lineBlockHeight = segmentLines.reduce(
      (total, line) => total + (line.height ?? lineHeight),
      0,
    );
    const bodyHeight = lineBlockHeight + 8;
    const height = Math.max(34, headerBlockHeight + bodyHeight);
    const x = xForColumn();
    const cardBottom = y - height;
    const headerFill = order.orderType === "adhoc" ? "1 0.96 0.82" : "0.95 0.96 0.96";

    drawRect(x, cardBottom, cardWidth, height);
    drawRect(x, y - headerBlockHeight, cardWidth, headerBlockHeight, "0.82 0.84 0.86 RG", headerFill);

    headerLines.forEach((line, index) => {
      drawText(line, x + cardPadding, y - 10.5 - index * 9, 7.5, true);
    });
    if (order.orderType === "adhoc") {
      drawAdhocBadge(x, y - 2);
    } else if (order.status === "updated") {
      drawUpdatedBadge(x, y - 2);
    }

    let textY = y - headerBlockHeight - 9;
    segmentLines.forEach((line) => {
      if (line.text) {
        drawText(
          line.text,
          x + cardPadding,
          textY,
          orderPdfBodyFontSize,
          line.bold,
          line.color,
        );
      }
      textY -= line.height ?? lineHeight;
    });

    y = cardBottom - 5;
    return segmentLines.length;
  }

  function drawOrderCard(order: LocalOrder) {
    const shop = shopById.get(order.shopId);
    const shopName = shop?.name || "Deleted shop";
    const productLines = orderProductLines(order).flatMap((line) => wrapPdfText(line, 20));
    const freeNotes = formatPdfNoteItems(order.notes);
    const replacementNotes = formatPdfNoteItems(order.replacementNotes);
    const freeLines = pdfNoteLines("Free", freeNotes, 28);
    const replacementLines = pdfNoteLines("Replacement", replacementNotes, 28);
    const contentLines: PdfLine[] = [
      ...(productLines.length ? productLines : ["No items"]).map((line) => ({
        text: line,
        bold: false,
      })),
      ...(freeLines.length || replacementLines.length
        ? [{ text: "", bold: false, height: 3 }]
        : []),
      ...freeLines.map((line) => ({
        text: line,
        bold: true,
        color: pdfBlue,
      })),
      ...(freeLines.length && replacementLines.length
        ? [{ text: "", bold: false, height: 2 }]
        : []),
      ...replacementLines.map((line) => ({
        text: line,
        bold: true,
        color: pdfRed,
      })),
      {
        text: `Total KG: ${getTotalKgLabel(order.items)}`,
        bold: true,
        color: pdfGreen,
      },
    ];
    let startIndex = 0;
    let isContinuation = false;

    while (startIndex < contentLines.length) {
      const drawnCount = drawOrderSegment({
        order,
        shopName,
        contentLines,
        startIndex,
        isContinuation,
      });
      startIndex += drawnCount;
      isContinuation = true;
      if (startIndex < contentLines.length) {
        nextColumn();
      }
    }
  }

  newPage();
  if (pdfOrders.length) {
    pdfOrders.forEach(drawOrderCard);
  } else {
    drawText("No orders found for selected filters.", margin, top, 10);
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
