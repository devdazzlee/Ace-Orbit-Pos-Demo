import jsPDF from 'jspdf';
import { format } from 'date-fns';

// Loads logo via canvas to strip problematic PNG metadata (e.g. C2PA/Samsung credentials)
// that cause jsPDF addImage to throw. Falls back gracefully.
const loadLogoDataUrl = (): Promise<string | null> => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 200;
        canvas.height = img.naturalHeight || 200;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        // Fill white first so transparent PNG areas don't become black in JPEG output
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92)); // JPEG = smaller, no metadata
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    // Cache-busting not needed; /logo.jpeg is served from Next.js public/
    img.src = '/logo.jpeg';
  });
};

export interface InvoiceData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  customerName: string;
  customerPhone: string;
  customerWhatsApp: string;
  customerEmail: string;
  saleNumber: string;
  date: Date;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    unit?: string;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  balanceDue: number; // if credit sale
  amountPaid?: number; // actual amount received
  previousBalance?: number; // customer's balance before this sale (negative = advance credit held)
  advanceApplied?: number; // advance credit from the customer's ledger used to settle this sale
  excessKeptAsCredit?: number; // overpayment left on the account as new advance credit
  changeReturned?: number; // cash handed back at the counter
  closingBalance?: number; // customer's balance after this sale (negative = advance credit held)
}

export interface InventoryReportData {
  storeName: string;
  date: Date;
  products: Array<{
    name: string;
    sku: string;
    category: string;
    stock: number;
    unit: string;
    purchaseRate: number;
    salesRate: number;
  }>;
}

export interface AnalyticsReportData {
  storeName: string;
  dateRange: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  uniqueCustomers: number;
  grossMargin: number;
  topProducts: Array<{
    name: string;
    revenue: number;
    quantity: number;
  }>;
}

const formatAmount = (amount: number) => {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const buildInvoiceDoc = (data: InvoiceData, logoDataUrl: string | null): jsPDF => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const topY = 14;
  const logoSize = 18;

  const snoX = margin;
  const descX = margin + 12;
  const qtyX = pageWidth - 80;
  const priceX = pageWidth - 50;
  const amountX = pageWidth - margin;

  doc.setFont('helvetica');

  const drawHeader = (): number => {
    // Logo + ACE ORBITS side by side
    let brandTextX = margin;
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'JPEG', margin, topY, logoSize, logoSize);
        brandTextX = margin + logoSize + 4;
      } catch {
        // skip silently
      }
    }

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('ACE ORBITS', brandTextX, topY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text('Shop no 109, 1st floor city shopping mall, Marston road, Karachi.', margin, topY + logoSize + 4);
    doc.text('Contact: (021) 3272-7444', margin, topY + logoSize + 8);

    // Invoice meta (top right)
    const labelX = pageWidth - 85;
    const valueX = pageWidth - margin;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', valueX, topY + 5, { align: 'right' });

    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('Date:', labelX, topY + 12);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(format(data.date, 'MMMM dd, yyyy'), valueX, topY + 12, { align: 'right' });

    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('Invoice No:', labelX, topY + 17);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`#${data.saleNumber}`, valueX, topY + 17, { align: 'right' });

    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('Payment:', labelX, topY + 22);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(data.paymentMethod, valueX, topY + 22, { align: 'right' });

    // Bill To
    const billY = topY + logoSize + 16;
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('BILL TO:', margin, billY);
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(data.customerName || 'Walk-in Customer', margin + 14, billY);

    // Table header
    const tableTop = billY + 6;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.5);
    doc.line(margin, tableTop, pageWidth - margin, tableTop);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text('S.NO', snoX, tableTop + 5);
    doc.text('DESCRIPTION', descX, tableTop + 5);
    doc.text('QTY', qtyX, tableTop + 5, { align: 'center' });
    doc.text('PRICE', priceX, tableTop + 5, { align: 'right' });
    doc.text('AMOUNT', amountX, tableTop + 5, { align: 'right' });

    doc.line(margin, tableTop + 8, pageWidth - margin, tableTop + 8);

    return tableTop + 13; // first row Y
  };

  const drawFooter = (pageNum: number, pageTotal: number) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 180);
    doc.text('Powered by ACE ORBITS | Support: +92 336 2500357 | www.aceorbitsus.com', pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text(`Page ${pageNum} of ${pageTotal}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  };

  const rowHeight = 6;
  const bottomReserve = 50; // space for summary + footer on last page
  const bottomReserveMid = 20; // space for footer only on intermediate pages

  let currentY = drawHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  data.items.forEach((item, index) => {
    const isLast = index === data.items.length - 1;
    const reserve = isLast ? bottomReserve : bottomReserveMid;
    if (currentY > pageHeight - reserve) {
      doc.addPage();
      currentY = drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
    }
    doc.text(String(index + 1), snoX, currentY);
    doc.text(item.name, descX, currentY);
    doc.text(item.quantity.toString(), qtyX, currentY, { align: 'center' });
    doc.text(formatAmount(item.price), priceX, currentY, { align: 'right' });
    doc.text(formatAmount(item.lineTotal), amountX, currentY, { align: 'right' });
    currentY += rowHeight;
  });

  // Summary — built as a row list first so the settlement story reads top to bottom
  // and the block height is known before deciding whether it needs a fresh page.
  const isCreditInvoice = String(data.paymentMethod).toUpperCase() === 'CREDIT';
  const advanceUsed = Math.max(0, data.advanceApplied ?? 0);
  const excessKept = Math.max(0, data.excessKeptAsCredit ?? 0);
  const changeGiven = Math.max(0, data.changeReturned ?? 0);
  const openingDue = Math.max(0, data.previousBalance ?? 0);
  const closingBalance = data.closingBalance ?? 0;
  const closingCredit = Math.max(0, -closingBalance);

  type SummaryRow = {
    label: string;
    value: string;
    tone?: 'red' | 'green';
    emphasis?: boolean;
    ruleBefore?: 'thin' | 'thick';
  };

  const rows: SummaryRow[] = [
    { label: 'Subtotal', value: formatAmount(data.subtotal) },
  ];

  if (data.discount > 0) {
    rows.push({ label: 'Discount', value: `- ${formatAmount(data.discount)}`, tone: 'red' });
  }

  rows.push({
    label: openingDue > 0 ? 'This Sale Total' : 'Grand Total',
    value: `PKR ${formatAmount(data.total)}`,
    tone: 'red',
    emphasis: true,
    ruleBefore: 'thick',
  });

  if (isCreditInvoice) {
    rows.push({
      label: 'Amount Paid',
      value: `PKR ${formatAmount(data.amountPaid ?? 0)}`,
      ruleBefore: 'thin',
    });
    rows.push({
      label: 'Balance Due',
      value: `PKR ${formatAmount(data.balanceDue ?? 0)}`,
      tone: 'red',
      emphasis: true,
    });
  } else if (advanceUsed > 0 || excessKept > 0) {
    // Only spell out the settlement when ledger credit was actually involved — an
    // ordinary walk-in cash sale keeps the plain Subtotal/Grand Total layout.
    const settlement: SummaryRow[] = [];
    if (advanceUsed > 0) {
      settlement.push({
        label: 'Advance Credit Used',
        value: `- ${formatAmount(advanceUsed)}`,
        tone: 'green',
      });
    }
    settlement.push({ label: 'Cash Received', value: formatAmount(data.amountPaid ?? 0) });
    if (changeGiven > 0) {
      settlement.push({ label: 'Change Returned', value: `- ${formatAmount(changeGiven)}` });
    }
    if (excessKept > 0) {
      settlement.push({
        label: 'Kept as Advance Credit',
        value: formatAmount(excessKept),
        tone: 'green',
      });
    }
    settlement[0].ruleBefore = 'thin';
    rows.push(...settlement);
  }

  if (openingDue > 0) {
    // Customer already owed us money before this sale — show it and the combined figure.
    rows.push({
      label: 'Previous Balance',
      value: `PKR ${formatAmount(openingDue)}`,
      tone: 'red',
      ruleBefore: 'thin',
    });
    rows.push({
      label: 'Net Payable',
      value: `PKR ${formatAmount(openingDue + data.total)}`,
      tone: 'red',
      emphasis: true,
      ruleBefore: 'thick',
    });
  } else if (closingCredit > 0.009) {
    rows.push({
      label: 'Advance Credit Balance',
      value: `PKR ${formatAmount(closingCredit)}`,
      tone: 'green',
      emphasis: true,
      ruleBefore: 'thick',
    });
  }

  const rowGap = 8;
  const ruleGap = 3;
  const summaryHeight =
    5 + rows.length * rowGap + rows.filter((r) => r.ruleBefore).length * ruleGap;
  if (currentY + summaryHeight > pageHeight - bottomReserveMid) {
    doc.addPage();
    currentY = drawHeader();
  }

  const sLabelX = pageWidth - 100;
  const sValueX = pageWidth - margin;
  let rowY = currentY + 5;

  rows.forEach((row, index) => {
    if (row.ruleBefore) {
      const ruleY = rowY - 4;
      if (row.ruleBefore === 'thick') {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
      } else {
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
      }
      doc.line(sLabelX, ruleY, sValueX, ruleY);
      rowY += ruleGap;
    }

    doc.setFontSize(row.emphasis ? 11 : 10);
    doc.setFont('helvetica', row.emphasis ? 'bold' : 'normal');
    doc.setTextColor(...(row.emphasis ? ([0, 0, 0] as const) : ([100, 100, 100] as const)));
    doc.text(row.label, sLabelX, rowY);

    doc.setFont('helvetica', 'bold');
    if (row.tone === 'red') doc.setTextColor(200, 0, 0);
    else if (row.tone === 'green') doc.setTextColor(0, 130, 70);
    else doc.setTextColor(0, 0, 0);
    doc.text(row.value, sValueX, rowY, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    if (index < rows.length - 1) rowY += rowGap;
  });

  // Draw footer on every page now that total count is known
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  return doc;
};

const buildReturnNoteDoc = (data: ReturnNoteData, logoDataUrl: string | null): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const topY = 14;
  const logoSize = 18;

  const rnSnoX = margin;
  const rnDescX = margin + 12;
  const rnQtyX = pageWidth - 80;
  const rnPriceX = pageWidth - 50;
  const rnAmountX = pageWidth - margin;

  doc.setFont('helvetica');

  const drawHeader = (): number => {
    let rnBrandTextX = margin;
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'JPEG', margin, topY, logoSize, logoSize);
        rnBrandTextX = margin + logoSize + 4;
      } catch {
        // skip silently
      }
    }
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('ACE ORBITS', rnBrandTextX, topY + 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('Return / Exchange Note', margin, topY + logoSize + 4);

    // Right Info
    const rLabelX = pageWidth - 85;
    const rValueX = pageWidth - margin;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RETURN', rValueX, topY + 5, { align: 'right' });

    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('Note No:', rLabelX, topY + 12);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`#${data.saleNumber}`, rValueX, topY + 12, { align: 'right' });

    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('Date:', rLabelX, topY + 17);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(format(data.date, 'MMM dd, yyyy'), rValueX, topY + 17, { align: 'right' });

    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('Ref Sale:', rLabelX, topY + 22);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`#${data.originalSaleNumber}`, rValueX, topY + 22, { align: 'right' });

    // Table header
    const tableTop = topY + logoSize + 14;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.5);
    doc.line(margin, tableTop, pageWidth - margin, tableTop);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text('S.NO', rnSnoX, tableTop + 5);
    doc.text('DESCRIPTION', rnDescX, tableTop + 5);
    doc.text('QTY', rnQtyX, tableTop + 5, { align: 'center' });
    doc.text('PRICE', rnPriceX, tableTop + 5, { align: 'right' });
    doc.text('AMOUNT', rnAmountX, tableTop + 5, { align: 'right' });
    doc.line(margin, tableTop + 8, pageWidth - margin, tableTop + 8);

    return tableTop + 13;
  };

  const drawFooter = (pageNum: number, pageTotal: number) => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 180);
    doc.text('Powered by ACE ORBITS | Support: +92 336 2500357 | www.aceorbitsus.com', pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text(`Page ${pageNum} of ${pageTotal}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  };

  const allItems = [
    ...data.returnedItems.map(i => ({ ...i, type: 'Return' })),
    ...data.exchangedItems.map(i => ({ ...i, type: 'Exchange' }))
  ];

  const rowHeight = 6;
  const bottomReserve = 40;
  const bottomReserveMid = 20;

  let currentY = drawHeader();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  allItems.forEach((item, index) => {
    const isLast = index === allItems.length - 1;
    const reserve = isLast ? bottomReserve : bottomReserveMid;
    if (currentY > pageHeight - reserve) {
      doc.addPage();
      currentY = drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
    }
    doc.text(String(index + 1), rnSnoX, currentY);
    doc.text(`${item.type}: ${item.name}`, rnDescX, currentY);
    doc.text(item.qty.toString(), rnQtyX, currentY, { align: 'center' });
    doc.text(formatAmount(item.price), rnPriceX, currentY, { align: 'right' });
    doc.text(formatAmount(item.qty * item.price), rnAmountX, currentY, { align: 'right' });
    currentY += rowHeight;
  });

  // Totals — push to new page if no room
  const rnPrevBalance = data.previousBalance && data.previousBalance > 0 ? data.previousBalance : 0;
  const hasCustomerAccount = !!(
    data.customerName &&
    data.customerName.trim() &&
    data.customerName.trim().toLowerCase() !== 'walk-in customer'
  );
  const showBalanceBlock = rnPrevBalance > 0 || hasCustomerAccount;
  const summaryHeightR = showBalanceBlock ? 44 : 28;
  if (currentY + summaryHeightR > pageHeight - bottomReserveMid) {
    doc.addPage();
    currentY = drawHeader();
  }

  const summaryY = currentY + 8;
  doc.setFontSize(10);
  if (data.refundTotal > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Total Refund', pageWidth - 85, summaryY);
    doc.setTextColor(200, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text(`- ${formatAmount(data.refundTotal)}`, pageWidth - margin, summaryY, { align: 'right' });
  }
  if (data.exchangeTotal > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Total Exchange', pageWidth - 85, summaryY + 8);
    doc.setTextColor(0, 0, 200);
    doc.setFont('helvetica', 'bold');
    doc.text(formatAmount(data.exchangeTotal), pageWidth - margin, summaryY + 8, { align: 'right' });
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(pageWidth - 85, summaryY + 12, pageWidth - margin, summaryY + 12);

  // Dynamic label: pure refund → "Refund Amount"; exchange → "Net Refund" / "Net Payable"
  const rnNetValue = data.refundTotal - data.exchangeTotal;
  const rnHasExchange = data.exchangeTotal > 0;
  const rnNetLabel = !rnHasExchange
    ? 'Refund Amount'
    : rnNetValue >= 0
      ? 'Net Refund'
      : 'Net Payable';

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(rnNetLabel, pageWidth - 85, summaryY + 18);
  doc.text(`PKR ${formatAmount(Math.abs(rnNetValue))}`, pageWidth - margin, summaryY + 18, { align: 'right' });

  // Customer account: balance before this return → balance after (refund credited to account)
  if (showBalanceBlock) {
    const balLabelX = pageWidth - 100;
    const balValueX = pageWidth - margin;
    const prevBalY = summaryY + 28;

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(balLabelX, prevBalY - 5, balValueX, prevBalY - 5);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Previous Balance', balLabelX, prevBalY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`PKR ${formatAmount(rnPrevBalance)}`, balValueX, prevBalY, { align: 'right' });

    const updatedBalance = rnPrevBalance + (data.exchangeTotal - data.refundTotal);
    const updBalDividerY = prevBalY + 4;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(balLabelX, updBalDividerY, balValueX, updBalDividerY);

    const updBalY = updBalDividerY + 7;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Updated Balance', balLabelX, updBalY);
    doc.setTextColor(updatedBalance < 0 ? 0 : 200, updatedBalance < 0 ? 150 : 0, 0);
    doc.text(`PKR ${formatAmount(updatedBalance)}`, balValueX, updBalY, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  // Footer on every page
  const totalPagesR = doc.getNumberOfPages();
  for (let p = 1; p <= totalPagesR; p++) {
    doc.setPage(p);
    drawFooter(p, totalPagesR);
  }

  return doc;
};

export const generateA4InvoicePDF = async (data: InvoiceData): Promise<string> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildInvoiceDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  return URL.createObjectURL(pdfBlob);
};

export const downloadA4Invoice = async (data: InvoiceData) => {
  const url = await generateA4InvoicePDF(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AceOrbits-Invoice-${data.saleNumber}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const printA4Invoice = async (data: InvoiceData) => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildInvoiceDoc(data, logoDataUrl);
  doc.autoPrint();
  const blobUrl = URL.createObjectURL(doc.output('blob'));
  const win = window.open(blobUrl);
  if (!win) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
};

type ShareResult =
  | { method: 'native' }
  | { method: 'desktop'; pdfDownloaded: true; whatsappOpened: boolean }
  | { method: 'no-number' };

export interface ReturnNoteData {
  saleNumber: string;
  originalSaleNumber: string;
  customerName?: string;
  customerPhone?: string;
  date: Date;
  returnedItems: Array<{ name: string; qty: number; price: number }>;
  exchangedItems: Array<{ name: string; qty: number; price: number }>;
  refundTotal: number;
  exchangeTotal: number;
  netAmount: number; // negative = net refund, positive = customer pays
  customerWhatsApp?: string;
  customerEmail?: string;
  previousBalance?: number; // customer's outstanding account balance (informational)
}

export const downloadReturnNote = async (data: ReturnNoteData) => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildReturnNoteDoc(data, logoDataUrl);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AceOrbits-Return-${data.saleNumber}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

export const printReturnNote = async (data: ReturnNoteData) => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildReturnNoteDoc(data, logoDataUrl);
  doc.autoPrint();
  const blobUrl = URL.createObjectURL(doc.output('blob'));
  const win = window.open(blobUrl);
  if (!win) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
};

export const shareOnWhatsApp = async (data: InvoiceData): Promise<ShareResult> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildInvoiceDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  const fileName = `AceOrbits-Invoice-${data.saleNumber}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({ title: `Invoice #${data.saleNumber}`, files: [pdfFile] });
      return { method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { method: 'native' };
    }
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const number = data.customerWhatsApp || data.customerPhone;
  if (!number) return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };

  let cleanNumber = number.replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '92' + cleanNumber.substring(1);
  }

  setTimeout(() => {
    window.open(`https://web.whatsapp.com/send?phone=${cleanNumber}`, '_blank');
  }, 500);

  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: true };
};

export const shareOnEmail = async (data: InvoiceData): Promise<ShareResult> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildInvoiceDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  const fileName = `AceOrbits-Invoice-${data.saleNumber}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({ 
        title: `Invoice #${data.saleNumber}`, 
        text: `Please find the invoice #${data.saleNumber} attached.`,
        files: [pdfFile] 
      });
      return { method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { method: 'native' };
    }
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const email = data.customerEmail || "";
  const subject = encodeURIComponent(`Invoice #${data.saleNumber} - Ace Orbits`);
  const body = encodeURIComponent(`Hello,\n\nPlease find your invoice #${data.saleNumber} attached to this email.\n\nThank you for shopping with us!`);
  
  window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');

  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };
};

export const shareInventoryReportOnEmail = async (data: InventoryReportData): Promise<ShareResult> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(`${data.storeName} - Inventory Report`, 15, 15);
  doc.setFontSize(10);
  doc.text(`Generated on: ${format(data.date, 'dd/MM/yyyy HH:mm')}`, 15, 20);

  let y = 35;
  doc.setFillColor(241, 245, 249);
  doc.rect(10, y, pageWidth - 20, 8, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Product Name', 15, y + 5);
  doc.text('SKU', 80, y + 5);
  doc.text('Stock', 120, y + 5);
  doc.text('Price', 150, y + 5);
  doc.text('Total Value', 180, y + 5);
  
  y += 12;
  doc.setFont('helvetica', 'normal');
  data.products.forEach((p, i) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(p.name.substring(0, 30), 15, y);
    doc.text(p.sku || '-', 80, y);
    doc.text(`${p.stock} ${p.unit}`, 120, y);
    doc.text(p.salesRate.toFixed(2), 150, y);
    doc.text((p.stock * p.salesRate).toFixed(2), 180, y);
    y += 7;
  });

  const pdfBlob = doc.output('blob');
  const fileName = `Inventory-Report-${format(data.date, 'yyyy-MM-dd')}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({ title: `Inventory Report`, files: [pdfFile] });
      return { method: 'native' };
    } catch (err) {}
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const subject = encodeURIComponent(`Inventory Report - ${data.storeName}`);
  const body = encodeURIComponent(`Hello,\n\nPlease find the inventory report attached.\n\nGenerated on: ${format(data.date, 'PPP p')}`);
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };
};

export const shareAnalyticsReportOnEmail = async (data: AnalyticsReportData): Promise<ShareResult> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('Business Analytics Report', 15, 20);
  doc.setFontSize(11);
  doc.text(`${data.storeName} | Range: ${data.dateRange}`, 15, 30);

  let y = 55;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary Metrics', 15, y);
  
  y += 10;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Revenue: Rs ${data.totalRevenue.toLocaleString()}`, 15, y);
  doc.text(`Total Orders: ${data.totalOrders}`, 100, y);
  y += 8;
  doc.text(`Avg Order Value: Rs ${data.avgOrderValue.toLocaleString()}`, 15, y);
  doc.text(`Unique Customers: ${data.uniqueCustomers}`, 100, y);
  y += 8;
  doc.text(`Gross Margin: Rs ${data.grossMargin.toLocaleString()}`, 15, y);

  y += 20;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Top Selling Products', 15, y);
  
  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  data.topProducts.forEach((p, i) => {
    doc.text(`${i+1}. ${p.name}`, 15, y);
    doc.text(`Rs ${p.revenue.toLocaleString()}`, 120, y);
    doc.text(`${p.quantity} units`, 160, y);
    y += 8;
  });

  const pdfBlob = doc.output('blob');
  const fileName = `Analytics-Report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({ title: `Analytics Report`, files: [pdfFile] });
      return { method: 'native' };
    } catch (err) {}
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const subject = encodeURIComponent(`Analytics Report - ${data.storeName}`);
  const body = encodeURIComponent(`Hello,\n\nPlease find the business analytics report attached.\n\nGenerated on: ${format(new Date(), 'PPP p')}`);
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };
};
export const shareReturnNoteOnWhatsApp = async (data: ReturnNoteData): Promise<ShareResult> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildReturnNoteDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  const fileName = `AceOrbits-Return-${data.saleNumber}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({ title: `Return Note #${data.saleNumber}`, files: [pdfFile] });
      return { method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { method: 'native' };
    }
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const number = data.customerWhatsApp || data.customerPhone;
  if (!number) return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };

  let cleanNumber = number.replace(/\D/g, '');
  if (cleanNumber.startsWith('0')) {
    cleanNumber = '92' + cleanNumber.substring(1);
  }

  setTimeout(() => {
    window.open(`https://web.whatsapp.com/send?phone=${cleanNumber}`, '_blank');
  }, 500);

  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: true };
};

export const shareReturnNoteOnEmail = async (data: ReturnNoteData): Promise<ShareResult> => {
  const logoDataUrl = await loadLogoDataUrl();
  const doc = buildReturnNoteDoc(data, logoDataUrl);
  const pdfBlob = doc.output('blob');
  const fileName = `AceOrbits-Return-${data.saleNumber}.pdf`;
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({ 
        title: `Return Note #${data.saleNumber}`, 
        text: `Please find the return note #${data.saleNumber} attached.`,
        files: [pdfFile] 
      });
      return { method: 'native' };
    } catch (err: any) {
      if (err?.name === 'AbortError') return { method: 'native' };
    }
  }

  const blobUrl = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

  const email = data.customerEmail || "";
  const subject = encodeURIComponent(`Return Note #${data.saleNumber} - Ace Orbits`);
  const body = encodeURIComponent(`Hello,\n\nPlease find your return note #${data.saleNumber} attached to this email.\n\nThank you!`);
  
  window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');

  return { method: 'desktop', pdfDownloaded: true, whatsappOpened: false };
};
