"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";

export type SheetColumnSpec = {
  /** Short label shown in the grid (often matches a suggested header in the sheet). */
  col: string;
  req?: boolean;
  hint: string;
};

export type ExcelSheetUploadModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  columns: SheetColumnSpec[];
  onFileSelected: (file: File) => void;
  onDownloadTemplate?: () => void;
  /** Extra line(s) below the column grid (e.g. optional columns not on Add Product). */
  extraHelp?: string;
};

export function ExcelSheetUploadModal({
  open,
  onOpenChange,
  title,
  description,
  columns,
  onFileSelected,
  onDownloadTemplate,
  extraHelp,
}: ExcelSheetUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Please choose a .csv, .xlsx, or .xls file.");
      return;
    }
    onFileSelected(file);
    onOpenChange(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-left text-slate-600">{description}</DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            acceptFile(e.dataTransfer.files?.[0]);
          }}
          className="border-2 border-dashed border-slate-300 rounded-lg p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-slate-50 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
          <FileSpreadsheet className="h-10 w-10 text-slate-400 mb-3" />
          <p className="font-semibold text-slate-700">Drop your file here</p>
          <p className="text-sm text-slate-500 mb-4">CSV, XLSX or XLS — max ~500 rows recommended</p>
          <Button type="button" onClick={() => fileInputRef.current?.click()} variant="default" size="sm">
            <Upload className="h-4 w-4 mr-2" /> Browse file
          </Button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-800">Required sheet format</h4>
              <Badge variant="secondary" className="text-[10px]">
                First row = column headers
              </Badge>
            </div>
            {onDownloadTemplate ? (
              <Button type="button" variant="outline" size="sm" onClick={onDownloadTemplate}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download template
              </Button>
            ) : null}
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
              {columns.map((f) => (
                <div key={f.col} className="flex flex-col rounded border border-slate-200 px-2.5 py-2 min-h-[4.5rem]">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="font-mono text-[11px] font-semibold text-slate-800">{f.col}</span>
                    {f.req ? (
                      <span className="text-red-500 text-[10px]">*required</span>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 leading-snug">{f.hint}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {extraHelp ? (
          <p className="text-xs text-slate-500 leading-relaxed px-1">{extraHelp}</p>
        ) : null}

        <DialogFooter className="sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
