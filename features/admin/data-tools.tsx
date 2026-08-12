"use client";

import { useMemo, useState } from "react";
import { Download, FileJson, RefreshCcw, Upload } from "lucide-react";
import {
  exportLocalAppData,
  importLocalAppData,
  localDataItems,
  resetLocalAppData,
  type LocalDataExport,
  type LocalDataKey,
} from "@/lib/local/app-data";

function getInitialSelection() {
  return new Set<LocalDataKey>(localDataItems.map((item) => item.key));
}

function downloadJsonFile(data: LocalDataExport) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `manish-masala-local-data-${data.exportedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseImportFile(file: File) {
  return new Promise<LocalDataExport>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsedValue = JSON.parse(String(reader.result));
        if (parsedValue?.app !== "manish-masala-sales-order-app" || parsedValue?.version !== 1) {
          reject(new Error("This is not a valid Manish Masala local data export."));
          return;
        }

        resolve(parsedValue as LocalDataExport);
      } catch {
        reject(new Error("Could not read this JSON file."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsText(file);
  });
}

export function AdminDataTools() {
  const [selectedKeys, setSelectedKeys] = useState<Set<LocalDataKey>>(() => getInitialSelection());
  const [message, setMessage] = useState<string | null>(null);
  const selectedCount = selectedKeys.size;
  const selectedKeyList = useMemo(() => Array.from(selectedKeys), [selectedKeys]);

  function toggleKey(key: LocalDataKey) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleExport() {
    downloadJsonFile(exportLocalAppData());
    setMessage("Local data export downloaded.");
  }

  async function handleImport(file: File | undefined) {
    if (!file || !selectedCount) {
      return;
    }

    try {
      const parsedData = await parseImportFile(file);
      if (!window.confirm(`Import ${selectedCount} selected local data sections? Current values will be overwritten.`)) {
        return;
      }

      importLocalAppData(parsedData, selectedKeyList);
      setMessage("Selected local data imported. Refresh open pages to see updates.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    }
  }

  function handleReset() {
    if (!selectedCount) {
      return;
    }

    if (!window.confirm(`Reset ${selectedCount} selected local data sections? This cannot be undone without an export.`)) {
      return;
    }

    resetLocalAppData(selectedKeyList);
    setMessage("Selected local data reset. Refresh open pages to see updates.");
  }

  return (
    <section className="space-y-4" aria-labelledby="data-tools-title">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <p className="text-sm font-semibold text-orange-700">Local backup and reset</p>
          <h2 id="data-tools-title" className="mt-1 text-2xl font-bold text-stone-900">
            Data Tools
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Export, import, or reset localStorage data for this rebuild branch. These actions do not read or write Supabase.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-stone-900">Selected sections</h3>
            <p className="mt-1 text-sm text-stone-600">{selectedCount} of {localDataItems.length} selected</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedKeys(getInitialSelection())}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => setSelectedKeys(new Set())}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {localDataItems.map((item) => (
            <label key={item.key} className="flex items-start gap-3 rounded-lg border border-stone-200 p-3 transition-colors hover:border-orange-200 hover:bg-orange-50/40">
              <input
                type="checkbox"
                checked={selectedKeys.has(item.key)}
                onChange={() => toggleKey(item.key)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block text-sm font-bold text-stone-900">{item.label}</span>
                <span className="block break-all text-xs text-stone-500">{item.storageKey}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 font-bold text-emerald-800 hover:bg-emerald-100"
        >
          <Download className="h-5 w-5" aria-hidden="true" />
          Export JSON
        </button>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-4 font-bold text-sky-800 hover:bg-sky-100">
          <Upload className="h-5 w-5" aria-hidden="true" />
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImport(event.target.files?.[0])}
            className="sr-only"
          />
        </label>
        <button
          type="button"
          onClick={handleReset}
          disabled={!selectedCount}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-4 font-bold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400"
        >
          <RefreshCcw className="h-5 w-5" aria-hidden="true" />
          Reset Selected
        </button>
      </div>

      {message ? (
        <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm font-semibold text-stone-700 shadow-sm">
          <FileJson className="mr-2 inline h-5 w-5 text-stone-500" aria-hidden="true" />
          {message}
        </div>
      ) : null}
    </section>
  );
}
