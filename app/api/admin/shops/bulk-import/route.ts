import { inflateRawSync } from "node:zlib";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { areSupabaseWritesEnabled } from "@/lib/config/write-mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ShopImportRow = {
  shopName: string;
  salespersonName: string;
  areaName: string;
  visitDay: string;
  phone: string;
  address: string;
};

type ZipEntry = {
  name: string;
  data: Buffer;
};

const requiredHeaders = ["shopname", "salespersonname", "areaname", "visitday"];
const maxUploadBytes = 2 * 1024 * 1024;
const maxZipEntries = 80;
const maxZipEntryBytes = 2 * 1024 * 1024;
const visitDayValues = new Set([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "as_required",
]);

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeVisitDay(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "asrequired" ? "as_required" : normalized;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlDecode(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries: { name: string; content: string }[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.content);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function columnName(index: number) {
  let value = "";
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }

  return value;
}

function buildSheetXml(rows: string[][]) {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map(
          (value, columnIndex) =>
            `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`,
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
}

function buildSampleWorkbook() {
  return makeZip([
    {
      name: "[Content_Types].xml",
      content:
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>",
    },
    {
      name: "_rels/.rels",
      content:
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>",
    },
    {
      name: "xl/workbook.xml",
      content:
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Shops\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>",
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: buildSheetXml([
        ["Shop Name", "Salesperson Name", "Area Name", "Visit Day", "Phone", "Address"],
        ["A-1 STORE", "Priyan Prajapati", "THAKURLI", "Monday", "9876543210", "Station road"],
      ]),
    },
  ]);
}

function readZipEntries(buffer: Buffer) {
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 66000); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error("Invalid Excel file.");
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  if (entryCount > maxZipEntries) {
    throw new Error("Excel file has too many internal files.");
  }

  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, ZipEntry>();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error("Invalid Excel central directory.");
    }

    const compressionMethod = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(centralOffset + 24);
    const nameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer.toString("utf8", centralOffset + 46, centralOffset + 46 + nameLength).replace(/\\/g, "/");

    if (
      compressedSize > maxZipEntryBytes ||
      uncompressedSize > maxZipEntryBytes ||
      name.includes("..")
    ) {
      throw new Error("Excel file is too large or invalid.");
    }

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
    const data =
      compressionMethod === 0
        ? compressedData
        : compressionMethod === 8
          ? inflateRawSync(compressedData)
          : null;

    if (!data) {
      throw new Error("Unsupported Excel compression method.");
    }

    entries.set(name, { name, data });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function getTagValue(xml: string, tag: string) {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return match ? xmlDecode(match[1].replace(/<[^>]+>/g, "")) : "";
}

function parseSharedStrings(xml: string | undefined) {
  if (!xml) {
    return [];
  }

  const values: string[] = [];
  const siPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let siMatch: RegExpExecArray | null;

  while ((siMatch = siPattern.exec(xml)) !== null) {
    const tValues: string[] = [];
    const tPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;

    while ((tMatch = tPattern.exec(siMatch[1])) !== null) {
      tValues.push(xmlDecode(tMatch[1]));
    }

    values.push(tValues.join(""));
  }

  return values;
}

function columnIndex(cellReference: string, fallback: number) {
  const match = /^([A-Z]+)/i.exec(cellReference);
  if (!match) {
    return fallback;
  }

  return match[1].toUpperCase().split("").reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function parseWorksheetRows(sheetXml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(sheetXml)) !== null) {
    const rowValues: string[] = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    let fallbackColumn = 0;

    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const reference = /r="([^"]+)"/.exec(attrs)?.[1] || "";
      const type = /t="([^"]+)"/.exec(attrs)?.[1] || "";
      const index = columnIndex(reference, fallbackColumn);
      const rawValue =
        type === "inlineStr"
          ? getTagValue(body, "t")
          : type === "s"
            ? sharedStrings[Number(getTagValue(body, "v"))] || ""
            : getTagValue(body, "v");

      rowValues[index] = rawValue.trim();
      fallbackColumn = index + 1;
    }

    if (rowValues.some(Boolean)) {
      rows.push(rowValues);
    }
  }

  return rows;
}

function parseShopRowsFromWorkbook(buffer: Buffer): ShopImportRow[] {
  const entries = readZipEntries(buffer);
  const sheetXml = entries.get("xl/worksheets/sheet1.xml")?.data.toString("utf8");
  if (!sheetXml) {
    throw new Error("Could not find the first worksheet.");
  }

  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml")?.data.toString("utf8"));
  const rows = parseWorksheetRows(sheetXml, sharedStrings);
  const [headers = [], ...dataRows] = rows;
  const headerIndexByName = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
  const missingHeader = requiredHeaders.find((header) => !headerIndexByName.has(header));

  if (missingHeader) {
    throw new Error("Excel must include Shop Name, Salesperson Name, Area Name, and Visit Day columns.");
  }

  return dataRows
    .map((row): ShopImportRow => ({
      shopName: row[headerIndexByName.get("shopname")!] || "",
      salespersonName: row[headerIndexByName.get("salespersonname")!] || "",
      areaName: row[headerIndexByName.get("areaname")!] || "",
      visitDay: row[headerIndexByName.get("visitday")!] || "",
      phone: row[headerIndexByName.get("phone") ?? -1] || "",
      address: row[headerIndexByName.get("address") ?? -1] || "",
    }))
    .filter((row) => row.shopName || row.salespersonName || row.areaName || row.visitDay);
}

export async function GET() {
  return new NextResponse(buildSampleWorkbook(), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"shop-import-sample.xlsx\"",
    },
  });
}

export async function POST(request: Request) {
  if (!areSupabaseWritesEnabled()) {
    return NextResponse.json({ error: "Shop import is disabled while writes are disabled." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile(supabase);

  if (!profile?.active || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin access is required." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload an .xlsx file." }, { status: 400 });
  }

  if (file.size > maxUploadBytes) {
    return NextResponse.json({ error: "Excel file must be 2 MB or smaller." }, { status: 400 });
  }

  try {
    const rows = parseShopRowsFromWorkbook(Buffer.from(await file.arrayBuffer()));

    if (!rows.length) {
      return NextResponse.json({ error: "No shop rows found in the Excel file." }, { status: 400 });
    }

    const profilesResponse = await supabase
      .from("profiles")
      .select("id, full_name, login_id, role, active")
      .eq("role", "sales")
      .eq("active", true);

    if (profilesResponse.error) {
      return NextResponse.json({ error: profilesResponse.error.message }, { status: 400 });
    }

    const salespeopleByName = new Map<string, string>();
    (profilesResponse.data || []).forEach((person) => {
      if (person.full_name) {
        salespeopleByName.set(normalizeText(person.full_name), person.id);
      }
      if (person.login_id) {
        salespeopleByName.set(normalizeText(person.login_id), person.id);
      }
    });

    const shopsResponse = await supabase.from("shops").select("name");
    if (shopsResponse.error) {
      return NextResponse.json({ error: shopsResponse.error.message }, { status: 400 });
    }

    const existingShopNames = new Set((shopsResponse.data || []).map((shop) => normalizeText(shop.name || "")));
    const fileShopNames = new Set<string>();
    const records = rows.map((row, index) => {
      const rowNumber = index + 2;
      const shopName = row.shopName.trim();
      const salespersonId = salespeopleByName.get(normalizeText(row.salespersonName));
      const visitDay = normalizeVisitDay(row.visitDay);

      if (!shopName || !row.salespersonName.trim() || !row.areaName.trim() || !row.visitDay.trim()) {
        throw new Error(`Row ${rowNumber}: Shop Name, Salesperson Name, Area Name, and Visit Day are required.`);
      }

      if (!salespersonId) {
        throw new Error(`Row ${rowNumber}: Salesperson "${row.salespersonName}" was not found.`);
      }

      if (!visitDayValues.has(visitDay)) {
        throw new Error(`Row ${rowNumber}: Visit Day "${row.visitDay}" is invalid.`);
      }

      const normalizedShopName = normalizeText(shopName);
      if (existingShopNames.has(normalizedShopName) || fileShopNames.has(normalizedShopName)) {
        throw new Error(`Row ${rowNumber}: Duplicate shop name "${shopName}".`);
      }
      fileShopNames.add(normalizedShopName);

      return {
        name: shopName,
        phone: row.phone.trim() || null,
        address: row.address.trim() || null,
        area: row.areaName.trim(),
        visit_day: visitDay,
        assigned_to: salespersonId,
      };
    });

    const insertResponse = await supabase.from("shops").insert(records);
    if (insertResponse.error) {
      return NextResponse.json({ error: insertResponse.error.message }, { status: 400 });
    }

    return NextResponse.json({ imported: records.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import shops." },
      { status: 400 },
    );
  }
}
