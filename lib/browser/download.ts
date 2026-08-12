export function fileSafe(value: string) {
  return (
    value
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "report"
  );
}

export function personFileSafe(value: string) {
  const parts = value
    .trim()
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`);

  return parts.join("") || "Salesperson";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
