import { z } from 'zod';

export const logStockOutSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product is required'),
    branchId: z.string().optional(),
    quantity: z.number().positive('Quantity must be positive'),
    reason: z.enum(['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED']),
    notes: z.string().optional(),
  }),
});

export const logReturnSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product is required'),
    branchId: z.string().optional(),
    quantity: z.number().positive('Quantity must be positive'),
    notes: z.string().optional(),
  }),
});
export const bulkStockOutSchema = z.object({
  body: z.object({
    branchId: z.string().optional(),
    reason: z.enum(['SALE', 'DAMAGE', 'LOSS', 'RETURN', 'EXPIRED']),
    notes: z.string().optional(),
    customerId: z.string().nullable().optional(),
    items: z.array(z.object({
      productId: z.string().min(1, 'Product is required'),
      quantity: z.number().positive('Quantity must be positive'),
      notes: z.string().optional(),
    })).min(1, 'At least one item is required'),
  }),
});
