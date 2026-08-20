import { z } from 'zod';

const supplierBaseSchema = {
    name: z.string().min(1, 'Name is required').max(100),
    phone_number: z.string().optional(),
    fax_number: z.string().optional(),
    mobile_number: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    status: z.string().optional(),
    email: z
        .union([z.string().email('Invalid email format'), z.literal('')])
        .optional(),
    ntn: z.string().optional(),
    strn: z.string().optional(),
    gov_id: z.string().optional(),
    address: z.string().optional(),
    display_on_pos: z.boolean().optional().default(true),
};

export const createSupplierSchema = z.object({
    body: z.object(supplierBaseSchema),
});

export const updateSupplierSchema = z.object({
    body: z.object({
        ...supplierBaseSchema,
        name: supplierBaseSchema.name.optional(),
    }),
    params: z.object({
        id: z.string().min(1, 'Supplier ID is required'),
    }),
});

export const getSupplierSchema = z.object({
    params: z.object({
        id: z.string().min(1, 'Supplier ID is required'),
    }),
});

export const listSuppliersSchema = z.object({
    query: z.object({
        page: z.string().optional().default('1'),
        limit: z.string().optional().default('10'),
        search: z.string().optional(),
        status: z.string().optional(),
    }),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>['body'];
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>['body'];