import { z } from 'zod';

export const createExpenseSchema = z.object({
    body: z.object({
        particular: z.string().min(1),
        amount: z.number().positive(),
        description: z.string().max(2000).optional().nullable(),
    }),
});

export const expenseIdParamSchema = z.object({
    params: z.object({
        id: z.string().uuid(),
    }),
});

export const listExpensesSchema = z.object({
    query: z.object({
        page: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
        search: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
    }),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>['body'];
