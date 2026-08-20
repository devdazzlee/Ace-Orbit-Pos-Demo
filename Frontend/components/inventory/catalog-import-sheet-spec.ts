import type { SheetColumnSpec } from "./excel-sheet-upload-modal";

/**
 * Same logical fields as **Add Product** (Stock Management → Inventory → Add Product).
 * Sheet headers can use the names below or common aliases (see hints).
 */
export const CATALOG_IMPORT_SHEET_COLUMNS: SheetColumnSpec[] = [
  { col: "Product Name", req: true, hint: 'Same as Add Product. Column can also be "Name".' },
  { col: "Unit", req: false, hint: "Same as Select unit — unit name (e.g. PCS). Auto-created if new." },
  { col: "Category", req: false, hint: "Same as Select category — category name. Auto-created if new." },
  {
    col: "Purchase Rate",
    req: true,
    hint: "Same as Add Product (required). Aliases: Buy Price (Rs), purchase_rate.",
  },
  {
    col: "Sales Rate",
    req: true,
    hint: 'Same as Add Product (required). Aliases: Sell Price (Rs), selling_price, sales_rate_inc_dis_and_tax, or column "Sales Rate".',
  },
  { col: "Min Stock", req: false, hint: "Same as Add Product. Defaults to 10 on Stock In Excel import if omitted; 0 if empty in this bulk dialog." },
  {
    col: "Stock",
    req: false,
    hint: "Same as Add Product — opening quantity. Aliases: Initial Stock Qty, Opening Stock, Quantity, stock.",
  },
];

/** Shown under the column grid in upload modals (Stock In + bulk importer). */
export const CATALOG_IMPORT_OPTIONAL_COLUMNS_NOTE =
  "Optional extra columns if you need them on the sheet only: Supplier, Brand, Description or Notes — not shown on Add Product.";
