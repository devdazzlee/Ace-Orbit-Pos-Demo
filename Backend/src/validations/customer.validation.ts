import { z } from "zod";

const cusRegisterationSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address').optional(),
    }),
});

const customerLoginSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address'),
        password: z.string().min(6, 'Password must be at least 6 characters long'),
    }),
});

const customerUpdateSchema = z.object({
    body: z.object({
        email: z.string().email('Invalid email address').optional(),
        name: z.string().optional().nullish(),
        phone_number: z
            .string()
            .max(15, 'Phone number must be at most 15 digits')
            .optional()
            .nullish(),
        address: z.string().optional().nullish(),
        billing_address: z.string().optional().nullish(),
        credit_limit: z.number().optional().nullish(),
        outstanding_balance: z.number().nonnegative('Balance cannot be negative').optional().nullish(),
    }),
});

export {
    cusRegisterationSchema,
    customerLoginSchema,
    customerUpdateSchema,
}