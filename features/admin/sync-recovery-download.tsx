"use client";

import { Download } from "lucide-react";

type SyncRecoveryDownloadProps = {
  fileName: string;
  snapshot: unknown;
};

export function SyncRecoveryDownload({ fileName, snapshot }: SyncRecoveryDownloadProps) {
  function handleDownload() {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Download
    </button>
  );
}
