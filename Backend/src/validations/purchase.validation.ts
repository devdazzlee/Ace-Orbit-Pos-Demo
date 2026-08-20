import { z } from 'zod';

export const createPurchaseSchema = z.object({
  body: z.object({
    supplierId: z.string().optional(),
    warehouseBranchId: z.string().optional(),
    purchaseDate: z.union([z.string(), z.date()]).optional(),
    invoiceRef: z.string().optional(),
    notes: z.string().optional(),
    deliveryStatus: z.enum(['PARTIAL', 'COMPLETE']).optional(),
    items: z.array(z.object({
      productId: z.string().min(1, 'Product ID is required'),
      quantity: z.number().positive('Quantity must be positive'),
      costPrice: z.number().min(0, 'Cost price must be >= 0'),
      salePrice: z.number().min(0, 'Sale price must be >= 0'),
      batchNo: z.string().optional(),
      expiryDate: z.string().optional(),
      ctns: z.number().optional(),
      piecePerCtn: z.number().optional(),
      cbmPerCtn: z.number().optional(),
      tCbm: z.number().optional(),
      gwPerCtn: z.number().optional(),
      tGw: z.number().optional(),
    })).min(1, 'At least one item is required'),
  }),
});

export const listPurchasesSchema = z.object({
  query: z.object({
    page: z.string().optional().default('1'),
    limit: z.string().optional().default('20'),
    productId: z.string().optional(),
    supplierId: z.string().optional(),
    branchId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
});
