import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

export interface SupplierLedgerExportEntry {
  date: string;
  humanType: string;
  description: string;
  reference_no: string | null;
  relatedRef: string | null;
  balanceBefore: number;
  signedChange: number;
  balance: number;
}

export interface SupplierLedgerExportParams {
  supplier: {
    name: string;
    code: string;
    phone_number: string | null;
    mobile_number: string | null;
    email: string | null;
  };
  summary: {
    totalPurchases: number;
    totalPaid: number;
    balanceDue: number;
    advanceBalance: number;
    balance: number;
  };
  entries: SupplierLedgerExportEntry[];
  dateFrom?: Date;
  dateTo?: Date;
  generatedAt?: Date;
}

const loadLogoDataUrl = (): Promise<string | null> => {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 200;
        canvas.height = img.naturalHeight || 200;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = "/logo.jpeg";
  });
};

/** jsPDF Helvetica only supports WinAnsi — avoid Unicode minus (U+2212) and em-dash (U+2014). */
const PDF_MINUS = "-";

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const fmtSignedBalance = (n: number) => {
  if (Math.abs(n) <= 0.009) return "0";
  return n < 0 ? `${PDF_MINUS}${fmtMoney(Math.abs(n))}` : fmtMoney(n);
};

const fmtSignedChange = (n: number) => {
  if (Math.abs(n) <= 0.009) return "-";
  return n > 0 ? `+${fmtMoney(n)}` : `${PDF_MINUS}${fmtMoney(Math.abs(n))}`;
};

const truncateText = (text: string, maxLen: number) =>
  text.length <= maxLen ? text : `${text.slice(0, maxLen - 3)}...`;

const periodLabel = (dateFrom?: Date, dateTo?: Date) => {
  if (dateFrom && dateTo) {
    return `${format(dateFrom, "dd MMM yyyy")} - ${format(dateTo, "dd MMM yyyy")}`;
  }
  if (dateFrom) return `From ${format(dateFrom, "dd MMM yyyy")}`;
  if (dateTo) return `Up to ${format(dateTo, "dd MMM yyyy")}`;
  return "All transactions";
};

const closingBalance = (summary: SupplierLedgerExportParams["summary"]) => {
  if (Math.abs(summary.balance) > 0.009) return summary.balance;
  if (summary.balanceDue > 0.009) return summary.balanceDue;
  if (summary.advanceBalance > 0.009) return -summary.advanceBalance;
  return 0;
};

export async function buildSupplierLedgerPdf(
  params: SupplierLedgerExportParams,
): Promise<jsPDF> {
  const logo = await loadLogoDataUrl();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const generatedAt = params.generatedAt ?? new Date();

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 24, "F");

  const brandX = margin + (logo ? 20 : 0);
  if (logo) {
    try {
      doc.addImage(logo, "JPEG", margin, 4, 16, 16);
    } catch {
      /* skip broken logo */
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("ACE ORBITS", brandX, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Shop 109, City Shopping Mall, Marston Road, Karachi · (021) 3272-7444", brandX, 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SUPPLIER LEDGER STATEMENT", pageWidth - margin, 11, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated ${format(generatedAt, "dd MMM yyyy, hh:mm a")}`, pageWidth - margin, 17, {
    align: "right",
  });

  let y = 30;

  // Supplier panel
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 20, 2, 2, "FD");

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(params.supplier.name.toUpperCase(), margin + 4, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const meta = [
    `Supplier Code: ${params.supplier.code || "-"}`,
    params.supplier.phone_number ? `Phone: ${params.supplier.phone_number}` : null,
    params.supplier.email ? `Email: ${params.supplier.email}` : null,
    `Statement Period: ${periodLabel(params.dateFrom, params.dateTo)}`,
  ]
    .filter(Boolean)
    .join("   ·   ");
  doc.text(meta, margin + 4, y + 15);

  y += 24;

  // KPI row
  const boxGap = 3;
  const boxW = (contentWidth - boxGap * 3) / 4;
  const kpis: Array<{ label: string; value: number; bg: [number, number, number]; fg: [number, number, number] }> =
    [
      {
        label: "TOTAL PURCHASES",
        value: params.summary.totalPurchases,
        bg: [255, 241, 242],
        fg: [190, 18, 60],
      },
      {
        label: "TOTAL PAID",
        value: params.summary.totalPaid,
        bg: [240, 253, 244],
        fg: [21, 128, 61],
      },
      {
        label: "OUTSTANDING",
        value: params.summary.balanceDue,
        bg: [255, 251, 235],
        fg: [180, 83, 9],
      },
      {
        label: "ADVANCE PAID",
        value: params.summary.advanceBalance,
        bg: [240, 249, 255],
        fg: [3, 105, 161],
      },
    ];

  kpis.forEach((kpi, i) => {
    const x = margin + i * (boxW + boxGap);
    doc.setFillColor(...kpi.bg);
    doc.roundedRect(x, y, boxW, 17, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...kpi.fg);
    doc.text(kpi.label, x + 3, y + 5);
    doc.setFontSize(10.5);
    doc.text(`Rs ${fmtMoney(kpi.value)}`, x + 3, y + 12);
  });

  y += 21;

  const sorted = [...params.entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const tableBody = sorted.map((entry, idx) => [
    String(idx + 1),
    `${format(new Date(entry.date), "dd MMM yyyy")}\n${format(new Date(entry.date), "hh:mm a")}`,
    entry.humanType,
    truncateText(entry.description, 72),
    truncateText(entry.relatedRef || entry.reference_no || "-", 28),
    fmtSignedBalance(entry.balanceBefore),
    fmtSignedChange(entry.signedChange),
    fmtSignedBalance(entry.balance),
  ]);

  const closeBal = closingBalance(params.summary);

  autoTable(doc, {
    startY: y,
    tableWidth: contentWidth,
    head: [
      [
        "#",
        "Date & Time",
        "Type",
        "Description",
        "Reference",
        "Before",
        "Change",
        "After",
      ],
    ],
    body: tableBody,
    foot: [
      [
        "",
        "",
        "",
        "CLOSING SUMMARY",
        "",
        "",
        fmtMoney(params.summary.totalPurchases),
        fmtSignedBalance(closeBal),
      ],
    ],
    theme: "grid",
    margin: { left: margin, right: margin, bottom: 14 },
    showHead: "everyPage",
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
      halign: "left",
      cellPadding: 2.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontSize: 8,
      fontStyle: "bold",
      halign: "right",
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 7, halign: "center" },
      1: { cellWidth: 20 },
      2: { cellWidth: 18 },
      3: { cellWidth: 88 },
      4: { cellWidth: 22 },
      5: { cellWidth: 38, halign: "right" },
      6: { cellWidth: 42, halign: "right" },
      7: { cellWidth: 38, halign: "right", fontStyle: "bold" },
    },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 2.5,
      overflow: "linebreak",
      valign: "middle",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (hookData) => {
      const { section, column, cell } = hookData;
      if ([5, 6, 7].includes(column.index)) {
        cell.styles.halign = "right";
        cell.styles.cellPadding = { top: 2.5, bottom: 2.5, left: 2, right: 3 };
      }
      if (section === "foot" && column.index === 3) {
        cell.styles.halign = "left";
      }
    },
    didDrawPage: (data) => {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      doc.text(
        "Ace Orbits ERP · Confidential supplier account statement",
        margin,
        pageHeight - 6,
      );
      doc.text(`Page ${data.pageNumber}`, pageWidth - margin, pageHeight - 6, {
        align: "right",
      });
    },
  });

  return doc;
}

export async function downloadSupplierLedgerPdf(
  params: SupplierLedgerExportParams,
  filename: string,
) {
  const doc = await buildSupplierLedgerPdf(params);
  doc.save(filename);
}

export async function printSupplierLedgerPdf(params: SupplierLedgerExportParams) {
  const doc = await buildSupplierLedgerPdf(params);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.src = url;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 1500);
    }, 300);
  };
}

export function mapLedgerEntriesForExport(
  entries: Array<{
    date: string;
    type: string;
    description: string;
    reference_no: string | null;
    purchaseId?: string | null;
    debit: number;
    credit: number;
    balance: number;
    payment_method?: string | null;
  }>,
): SupplierLedgerExportEntry[] {
  const typeLabel = (type: string, paymentMethod?: string | null) => {
    if (type === "CREDIT_PURCHASE") return "Credit Purchase";
    if (type === "CASH_PURCHASE") {
      if (paymentMethod === "CARD") return "Card Purchase";
      return "Cash Purchase";
    }
    if (type === "PAYMENT_MADE") return "Payment Made";
    if (type === "REFUND") return "Refund";
    if (type === "ADJUSTMENT") return "Adjustment";
    return type.replace(/_/g, " ");
  };

  return entries.map((entry) => {
    const signedChange = Number((entry.debit - entry.credit).toFixed(2));
    const balanceBefore = Number((entry.balance - signedChange).toFixed(2));
    const ref =
      entry.reference_no?.trim() ||
      entry.purchaseId?.trim() ||
      entry.description.match(/PUR-\d+/i)?.[0]?.toUpperCase() ||
      null;

    return {
      date: entry.date,
      humanType: typeLabel(entry.type, entry.payment_method),
      description: entry.description,
      reference_no: entry.reference_no,
      relatedRef: ref,
      balanceBefore,
      signedChange,
      balance: entry.balance,
    };
  });
}

export function buildSupplierLedgerExportParams(input: {
  supplier: SupplierLedgerExportParams["supplier"];
  summary: SupplierLedgerExportParams["summary"];
  enrichedEntries: SupplierLedgerExportEntry[];
  dateFrom?: Date;
  dateTo?: Date;
}): SupplierLedgerExportParams {
  return {
    supplier: input.supplier,
    summary: input.summary,
    entries: input.enrichedEntries,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    generatedAt: new Date(),
  };
}
