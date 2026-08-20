"use client";

import { useState, useRef } from "react";
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  Download,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { PageLoader } from "@/components/ui/page-loader";
import apiClient, { BULK_UPLOAD_AXIOS_TIMEOUT_MS } from "@/lib/apiClient";
import type { AxiosResponse } from "axios";
import { toast } from "sonner";
import { usePosData } from "@/hooks/use-pos-data";
import * as XLSX from "xlsx";
import {
  CATALOG_IMPORT_SHEET_COLUMNS,
  CATALOG_IMPORT_OPTIONAL_COLUMNS_NOTE,
} from "@/components/inventory/catalog-import-sheet-spec";

interface BulkImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type StagedRow = {
  name: string;
  sku: string;
  category_name: string;
  unit_name: string;
  purchase_rate: number;
  sales_rate_inc_dis_and_tax: number;
  stock: number;
  min_qty: number;
};

type RowResult = {
  success: boolean;
  name?: string;
  sku?: string;
  error?: string;
  data?: any;
  /** True when the row was accepted locally and will sync when back online */
  _syncPending?: boolean;
};

/** Normalize bulk-upload response: API returns an array; offline/synthetic legacy shape used `products` on data.data. */
function extractBulkUploadRowResults(res: AxiosResponse): RowResult[] {
  const root = res.data as Record<string, unknown> | undefined;
  if (!root) return [];
  const raw = root.data !== undefined ? root.data : root;
  if (Array.isArray(raw)) return raw as RowResult[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { products?: unknown }).products)) {
    const pending = Boolean(root._syncPending || (raw as { _syncPending?: boolean })._syncPending);
    return ((raw as { products: Record<string, unknown>[] }).products || []).map((p, idx) => ({
      success: true,
      name: String(p?.name ?? p?.Name ?? "").trim() || `Row ${idx + 1}`,
      sku: (p?.sku ?? p?.SKU) as string | undefined,
      _syncPending: pending,
    }));
  }
  return [];
}

const TEMPLATE_SAMPLE = [
  {
    "Product Name": "Sample Product A",
    Unit: "PCS",
    Category: "Beverages",
    "Purchase Rate": 100,
    "Sales Rate": 150,
    Stock: 50,
    "Min Stock": 10,
  },
  {
    "Product Name": "Sample Product B",
    Unit: "PCS",
    Category: "Snacks",
    "Purchase Rate": 75,
    "Sales Rate": 120,
    Stock: 100,
    "Min Stock": 20,
  },
];

const CHUNK_SIZE = 10;

export function BulkImporter({ open, onOpenChange }: BulkImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [stagingData, setStagingData] = useState<StagedRow[] | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [parseStats, setParseStats] = useState<{ totalRows: number; acceptedRows: number } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; label?: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { fetchProducts } = usePosData();

  const normalizeRow = (row: any): StagedRow => ({
    name: String(row["Product Name"] ?? row.name ?? row.Name ?? "").trim(),
    sku: String(row.sku ?? row.SKU ?? "").trim(),
    category_name: String(row.category ?? row.Category ?? row.category_name ?? "").trim(),
    unit_name: String(row.unit ?? row.Unit ?? row.unit_name ?? "").trim(),
    purchase_rate:
      Number(
        row["Purchase Rate"] ??
          row.purchase_rate ??
          row["Buy Price (Rs)"] ??
          row["Buy Price"] ??
          0
      ) || 0,
    sales_rate_inc_dis_and_tax:
      Number(
        row["Sales Rate"] ??
          row.selling_price ??
          row["Selling Price"] ??
          row["Sell Price (Rs)"] ??
          row.sales_rate_inc_dis_and_tax ??
          0
      ) || 0,
    stock: Number(row.stock ?? row.Stock ?? row.qty ?? row["Initial Stock Qty"] ?? 0) || 0,
    min_qty: Number(row.min_qty ?? row["Min Qty"] ?? row["Min Stock"] ?? 0) || 0,
  });

  const processFile = async (selectedFile: File) => {
    setIsParsing(true);
    setFile(selectedFile);
    try {
      const buf = await selectedFile.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws);
      const rows = json.map(normalizeRow).filter((r) => r.name);
      setParseStats({ totalRows: json.length, acceptedRows: rows.length });
      if (rows.length === 0) {
        toast.error('No valid rows found. Make sure the sheet has a "Product Name" or "name" column.');
        setFile(null);
        return;
      }
      if (rows.length < json.length) {
        toast.warning(
          `${json.length - rows.length} row(s) were skipped because product name was empty. ` +
            `Parsed ${rows.length} of ${json.length}.`
        );
      }
      setStagingData(rows);
      setResults(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to parse file. Please upload a valid CSV or Excel file.");
      setFile(null);
      setParseStats(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Please upload a .csv, .xlsx, or .xls file.");
      return;
    }
    processFile(f);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "stock-bulk-upload-template.xlsx");
  };

  const updateRow = (index: number, field: keyof StagedRow, value: any) => {
    if (!stagingData) return;
    const next = [...stagingData];
    next[index] = { ...next[index], [field]: value };
    setStagingData(next);
  };

  const removeRow = (index: number) => {
    if (!stagingData) return;
    const next = [...stagingData];
    next.splice(index, 1);
    setStagingData(next);
  };

  const validateRows = (): string | null => {
    if (!stagingData || stagingData.length === 0) return "No rows to upload.";
    for (let i = 0; i < stagingData.length; i++) {
      const r = stagingData[i];
      if (!r.name) return `Row ${i + 1}: product name is required.`;
      if (!r.purchase_rate || Number(r.purchase_rate) <= 0)
        return `Row ${i + 1}: purchase rate must be greater than 0 (same as Add Product).`;
      if (!r.sales_rate_inc_dis_and_tax || r.sales_rate_inc_dis_and_tax <= 0)
        return `Row ${i + 1}: sales rate must be greater than 0 (same as Add Product).`;
    }
    return null;
  };

  const handleUpload = async () => {
    if (!stagingData) return;
    const err = validateRows();
    if (err) {
      toast.error(err);
      return;
    }

    setIsUploading(true);
    const totalRows = stagingData.length;
    setProgress({ current: 0, total: totalRows, label: `Preparing ${totalRows} row(s)…` });
    const all: RowResult[] = [];
    let rowsCommitted = 0;

    try {
      for (let i = 0; i < stagingData.length; i += CHUNK_SIZE) {
        const chunk = stagingData.slice(i, i + CHUNK_SIZE);
        const batchEnd = Math.min(i + CHUNK_SIZE, stagingData.length);
        setProgress({
          current: i,
          total: totalRows,
          label: `Uploading rows ${i + 1}–${batchEnd} of ${totalRows}…`,
        });
        const res = await apiClient.post(
          "/products/bulk-upload",
          { products: chunk },
          { timeout: BULK_UPLOAD_AXIOS_TIMEOUT_MS }
        );
        const chunkResults = extractBulkUploadRowResults(res);
        const resRoot = res.data as { _syncPending?: boolean } | undefined;
        const chunkWasPending = Boolean(resRoot?._syncPending);
        if (
          !chunkWasPending &&
          chunkResults.length > 0 &&
          chunkResults.length !== chunk.length
        ) {
          toast.warning(
            `Batch rows ${i + 1}–${batchEnd}: API returned ${chunkResults.length} result(s) for ${chunk.length} row(s). Check server logs.`
          );
        }
        if (chunkResults.length === 0 && chunk.length > 0) {
          toast.error(
            `No result rows for batch ${i + 1}–${batchEnd}. Check the network response or try again.`
          );
          for (const row of chunk) {
            all.push({
              success: false,
              name: row.name,
              sku: row.sku,
              error: "Empty or unrecognized response from server",
            });
          }
        } else {
          all.push(...chunkResults);
        }
        rowsCommitted += chunk.length;
        setProgress({ current: batchEnd, total: totalRows, label: `Finished rows 1–${batchEnd}…` });
      }

      setResults(all);
      const ok = all.filter((r) => r.success).length;
      const fail = all.length - ok;
      const anyPending = all.some((r) => r._syncPending);
      if (ok > 0) {
        toast.success(
          anyPending
            ? `${ok} product row(s) queued locally; they will sync when you are back online.${
                fail ? ` ${fail} failed.` : ""
              }`
            : `${ok} product${ok === 1 ? "" : "s"} uploaded${fail ? `, ${fail} failed` : ""}.`
        );
        fetchProducts({ force: true });
      } else {
        toast.error("Upload failed. See details below.");
      }
    } catch (e: any) {
      console.error(e);
      const timedOut = String(e?.message ?? "").toLowerCase().includes("timeout");
      const msg =
        e?.response?.data?.message ||
        (timedOut
          ? "Request timed out before the server replied. The import may still be running on the server — refresh inventory in a moment, or use a smaller file."
          : e?.message) ||
        "Bulk upload failed.";
      toast.error(msg);
      const tail = stagingData.slice(rowsCommitted);
      if (all.length > 0 || tail.length > 0) {
        setResults([
          ...all,
          ...tail.map((r) => ({
            success: false,
            name: r.name,
            sku: r.sku,
            error: rowsCommitted > 0 ? `Not sent after error: ${msg}` : msg,
          })),
        ]);
      }
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  };

  const reset = () => {
    setFile(null);
    setStagingData(null);
    setResults(null);
    setParseStats(null);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  /* ----- views ----- */

  const uploadView = (
    <div className="flex flex-col gap-4 py-2">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-slate-50 transition-colors"
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
        />
        <FileSpreadsheet className="h-10 w-10 text-slate-400 mb-3" />
        <p className="font-semibold text-slate-700">Drop your file here</p>
        <p className="text-sm text-slate-500 mb-4">CSV, XLSX or XLS — max ~500 rows recommended</p>
        <Button onClick={() => fileInputRef.current?.click()} variant="default" size="sm">
          <Upload className="h-4 w-4 mr-2" /> Browse file
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-800">Required sheet format</h4>
            <Badge variant="secondary" className="text-[10px]">First row = column headers</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Download template
          </Button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {CATALOG_IMPORT_SHEET_COLUMNS.map((f) => (
              <div key={f.col} className="flex flex-col rounded border border-slate-200 px-2.5 py-2 min-h-[4.5rem]">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-mono text-[11px] font-semibold text-slate-800">{f.col}</span>
                  {f.req && <span className="text-red-500 text-[10px]">*required</span>}
                </div>
                <span className="text-[10px] text-slate-500 mt-1 leading-snug">{f.hint}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{CATALOG_IMPORT_OPTIONAL_COLUMNS_NOTE}</p>
        </div>
      </div>
    </div>
  );

  const stagingView = stagingData && (
    <div className="flex flex-col flex-1 overflow-hidden gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-medium">
            {stagingData.length} {stagingData.length === 1 ? "row" : "rows"} parsed
          </Badge>
          {file && <span className="text-xs text-slate-500 truncate max-w-xs">{file.name}</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="text-slate-500">
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Clear
        </Button>
      </div>

      <div className="flex-1 border border-slate-200 rounded-lg bg-white min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="min-w-[880px]">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-20">
                <tr className="text-left text-[11px] font-semibold uppercase text-slate-500 shadow-sm">
                  <th className="px-3 py-3 w-10 bg-slate-50">#</th>
                  <th className="px-3 py-3 bg-slate-50">Product Name *</th>
                  <th className="px-3 py-3 w-36 bg-slate-50">Category</th>
                  <th className="px-3 py-3 w-28 bg-slate-50">Unit</th>
                  <th className="px-3 py-3 w-28 bg-slate-50">Purchase rate *</th>
                  <th className="px-3 py-3 w-28 bg-slate-50">Sales rate *</th>
                  <th className="px-3 py-3 w-24 bg-slate-50">Stock</th>
                  <th className="px-3 py-3 w-24 bg-slate-50">Min</th>
                  <th className="px-3 py-3 w-12 bg-slate-50 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stagingData.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-3 py-2 text-slate-400 text-xs font-mono">{i + 1}</td>
                    <td className="px-2 py-2">
                      <Input value={r.name} onChange={(e) => updateRow(i, "name", e.target.value)} className="h-9 text-sm border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </td>
                    <td className="px-2 py-2">
                      <Input value={r.category_name} onChange={(e) => updateRow(i, "category_name", e.target.value)} className="h-9 text-sm border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <Input value={r.unit_name} onChange={(e) => updateRow(i, "unit_name", e.target.value)} className="h-9 text-sm border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <Input type="number" value={r.purchase_rate} onChange={(e) => updateRow(i, "purchase_rate", Number(e.target.value))} className="h-9 text-sm border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <Input type="number" value={r.sales_rate_inc_dis_and_tax} onChange={(e) => updateRow(i, "sales_rate_inc_dis_and_tax", Number(e.target.value))} className="h-9 text-sm border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <Input type="number" value={r.stock} onChange={(e) => updateRow(i, "stock", Number(e.target.value))} className="h-9 text-sm border-slate-200" />
                    </td>
                    <td className="px-2 py-2">
                      <Input type="number" value={r.min_qty} onChange={(e) => updateRow(i, "min_qty", Number(e.target.value))} className="h-9 text-sm border-slate-200" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-rose-500 hover:bg-rose-50" onClick={() => removeRow(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isUploading && progress && (
        <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-blue-900">
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
            </span>
            <span className="tabular-nums">
              {progress.current} / {progress.total} done
            </span>
          </div>
          {progress.label ? (
            <p className="text-[11px] text-blue-900/85 leading-snug">{progress.label}</p>
          ) : null}
          <Progress
            value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
            className="h-1.5"
          />
        </div>
      )}
    </div>
  );

  const resultsView = results && (
    <div className="flex flex-col flex-1 overflow-hidden gap-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-emerald-700">Successful</p>
          <p className="text-2xl font-bold text-emerald-700">{results.filter((r) => r.success).length}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-red-700">Failed</p>
          <p className="text-2xl font-bold text-red-700">{results.filter((r) => !r.success).length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-semibold uppercase text-slate-600">Total</p>
          <p className="text-2xl font-bold text-slate-700">{results.length}</p>
        </div>
      </div>
      {parseStats && stagingData ? (
        <div className="text-xs text-slate-500 space-y-1.5 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2">
          <p>
            <span className="font-medium text-slate-700">Server results:</span>{" "}
            <strong>{results.length}</strong> row{results.length === 1 ? "" : "s"} (one entry per row the
            API processed).
          </p>
          <p>
            <span className="font-medium text-slate-700">Preview before upload:</span>{" "}
            <strong>{stagingData.length}</strong> row{stagingData.length === 1 ? "" : "s"} sent — edit or
            delete rows in the table changes this; it does not re-read the file.
          </p>
          <p>
            <span className="font-medium text-slate-700">Spreadsheet:</span>{" "}
            <strong>{parseStats.acceptedRows}</strong> of <strong>{parseStats.totalRows}</strong> row(s) had
            a product name after parsing
            {parseStats.totalRows > parseStats.acceptedRows
              ? ` (${parseStats.totalRows - parseStats.acceptedRows} skipped: empty name)`
              : ""}.
          </p>
          {stagingData.length < parseStats.acceptedRows ? (
            <p className="text-slate-600">
              Fewer rows were uploaded than the file contained because{" "}
              <strong>{parseStats.acceptedRows - stagingData.length}</strong> row
              {parseStats.acceptedRows - stagingData.length === 1 ? " was" : "s were"} removed or cleared in
              the preview before you clicked Upload.
            </p>
          ) : null}
          {stagingData.length !== results.length ? (
            <p className="text-amber-800 font-medium">
              Unexpected: the upload reported {results.length} result row(s) for {stagingData.length} submitted
              row(s). If you were offline, ensure each batch synced; otherwise inspect{" "}
              <code className="rounded bg-amber-100/80 px-1">POST /products/bulk-upload</code> responses.
            </p>
          ) : null}
          {results.some((r) => r._syncPending) ? (
            <p className="text-amber-800">
              Rows marked pending are stored in the offline queue on this device and are not in the database
              until sync completes.
            </p>
          ) : null}
        </div>
      ) : parseStats ? (
        <p className="text-xs text-slate-500">
          Parsed {parseStats.acceptedRows} of {parseStats.totalRows} row(s) from file.
        </p>
      ) : null}

      <div className="flex-1 border border-slate-200 rounded-lg bg-white min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="min-w-[600px]">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-left text-[11px] font-semibold uppercase text-slate-500">
                  <th className="px-3 py-3 w-24 bg-slate-50">Status</th>
                  <th className="px-3 py-3 bg-slate-50">Product</th>
                  <th className="px-3 py-3 bg-slate-50">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r, i) => (
                  <tr key={i} className={r.success ? "" : "bg-red-50/30"}>
                    <td className="px-3 py-3">
                      {r.success ? (
                        r._syncPending ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                            <Loader2 className="h-4 w-4 animate-spin" /> Pending sync
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" /> Success
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                          <AlertCircle className="h-4 w-4" /> Failed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-800">{r.name || r.data?.name || "—"}</td>
                    <td
                      className={`px-3 py-3 text-xs ${
                        r.success ? (r._syncPending ? "text-amber-800" : "text-slate-500") : "text-red-600"
                      }`}
                    >
                      {r.success
                        ? r._syncPending
                          ? `Queued on this device — will upload when online${r.name ? ` (${r.name})` : ""}`
                          : `Saved${r.name ? ` (${r.name})` : ""}`
                        : r.error || "Unknown error"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  /* ----- footer ----- */

  const footer = (
    <DialogFooter className="border-t pt-4 mt-2">
      {!stagingData && !results ? (
        <Button variant="ghost" onClick={() => handleClose(false)}>Close</Button>
      ) : results ? (
        <div className="flex w-full justify-between">
          <Button variant="outline" onClick={reset}>Upload another file</Button>
          <Button onClick={() => handleClose(false)}>Done</Button>
        </div>
      ) : (
        <div className="flex w-full justify-between">
          <Button variant="ghost" onClick={reset} disabled={isUploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={isUploading} className="min-w-[140px]">
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…
              </>
            ) : (
              <>Upload {stagingData?.length} {stagingData?.length === 1 ? "row" : "rows"}</>
            )}
          </Button>
        </div>
      )}
    </DialogFooter>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Bulk Upload Products & Stock</DialogTitle>
          <DialogDescription>
            {!stagingData && !results
              ? "Add new catalog products and opening stock from a sheet. Columns match Add Product (Inventory): product name, unit, category, purchase rate, sales rate, min stock, stock. Purchase and sales rates must be > 0. Item codes are generated when missing. For supplier receipts or dispatches, use Stock In / Stock Out — not this dialog."
              : results
              ? "Upload finished. Review the results below."
              : "Review the rows below and click Upload to commit."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          {isParsing ? (
            <PageLoader message="Parsing file..." size="sm" />
          ) : results ? (
            resultsView
          ) : stagingData ? (
            stagingView
          ) : (
            uploadView
          )}
        </div>

        {footer}
      </DialogContent>
    </Dialog>
  );
}
