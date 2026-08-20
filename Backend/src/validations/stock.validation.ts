import { z } from "zod";

const createStockSchema = z.object({
    body: z.object({
        productId: z.string().min(1),
        branchId: z.string().optional(),
        quantity: z.number().positive().min(0.01),
    }),
});

const adjustStockSchema = z.object({
    body: z.object({
        productId: z.string().min(1),
        branchId: z.string().optional(),
        quantityChange: z.number().int().refine(val => val !== 0, { message: "Quantity change must not be zero" }),
        reason: z.string().optional(),
    }),
});

const transferStockSchema = z.object({
    body: z.object({
        productId: z.string().min(1, "Product ID is required"),
        fromBranchId: z.string().min(1, "Source branch ID is required"),
        toBranchId: z.string().min(1, "Destination branch ID is required"),
        quantity: z.number().int().min(1, "Quantity must be at least 1"),
        notes: z.string().optional(),
    }),
});

const removeStockSchema = z.object({
    body: z.object({
        productId: z.string().min(1, "Product ID is required"),
        branchId: z.string().optional(),
        quantity: z.number().positive().min(0.01, "Quantity must be greater than 0"),
        reason: z.string().optional(),
    }),
});

export { createStockSchema, adjustStockSchema, transferStockSchema, removeStockSchema };
