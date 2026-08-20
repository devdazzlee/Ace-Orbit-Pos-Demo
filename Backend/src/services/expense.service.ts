import { prisma } from '../prisma/client';
import { CreateExpenseInput } from '../validations/expense.validation';
import { AppError } from '../utils/apiError';
import { Prisma } from '@prisma/client';

function parseExpenseBoundary(raw: string, kind: 'start' | 'end'): Date {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        throw new AppError(400, `Invalid ${kind} date`);
    }
    if (raw.includes('T')) {
        return parsed;
    }
    if (kind === 'start') {
        return new Date(`${raw}T00:00:00.000Z`);
    }
    return new Date(`${raw}T23:59:59.999Z`);
}

export class ExpenseService {
    async createExpense(data: CreateExpenseInput) {
        const description = data.description?.trim() || null;
        return await prisma.expense.create({
            data: {
                particular: data.particular.trim(),
                amount: data.amount,
                description,
            },
        });
    }

    async getExpenseById(id: string) {
        const expense = await prisma.expense.findUnique({ where: { id } });
        if (!expense) {
            throw new AppError(404, 'Expense not found');
        }
        return expense;
    }

    async deleteExpense(id: string) {
        const expense = await prisma.expense.findUnique({ where: { id } });
        if (!expense) {
            throw new AppError(404, 'Expense not found');
        }
        await prisma.expense.delete({ where: { id } });
        return { id, message: 'Expense deleted successfully' };
    }

    async listExpenses({
        page = 1,
        limit = 10,
        search,
        startDate,
        endDate,
    }: {
        page?: number;
        limit?: number;
        search?: string;
        startDate?: string;
        endDate?: string;
    }) {
        const where: Prisma.ExpenseWhereInput = {
            ...(search?.trim()
                ? {
                      OR: [
                          {
                              particular: {
                                  contains: search.trim(),
                                  mode: 'insensitive',
                              },
                          },
                          {
                              description: {
                                  contains: search.trim(),
                                  mode: 'insensitive',
                              },
                          },
                      ],
                  }
                : {}),
            ...(startDate || endDate
                ? {
                      created_at: {
                          ...(startDate ? { gte: parseExpenseBoundary(startDate, 'start') } : {}),
                          ...(endDate
                              ? endDate.includes('T')
                                  ? { lt: parseExpenseBoundary(endDate, 'end') }
                                  : { lte: parseExpenseBoundary(endDate, 'end') }
                              : {}),
                      },
                  }
                : {}),
        };

        const [expenses, total] = await Promise.all([
            prisma.expense.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
            }),
            prisma.expense.count({ where }),
        ]);

        return {
            data: expenses,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async create(data: { name: string }) {
        return prisma.employeeType.create({ data });
    }

    async getAll() {
        return prisma.employeeType.findMany();
    }

    async getById(id: string) {
        return prisma.employeeType.findUniqueOrThrow({ where: { id } });
    }

    async update(id: string, data: { name?: string; is_active?: boolean }) {
        return prisma.employeeType.update({ where: { id }, data });
    }

    async delete(id: string) {
        const DEFAULT_DESIGNATION = 'General';

        const employeeType = await prisma.employeeType.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { employees: true },
                },
            },
        });

        if (!employeeType) {
            throw new AppError(404, 'Designation not found');
        }

        await prisma.$transaction(async (tx) => {
            if (employeeType._count.employees > 0) {
                let fallbackId: string;

                if (employeeType.name !== DEFAULT_DESIGNATION) {
                    let general = await tx.employeeType.findFirst({
                        where: { name: DEFAULT_DESIGNATION, id: { not: id } },
                    });
                    if (!general) {
                        general = await tx.employeeType.create({
                            data: { name: DEFAULT_DESIGNATION },
                        });
                    }
                    fallbackId = general.id;
                } else {
                    const other = await tx.employeeType.findFirst({
                        where: { id: { not: id } },
                        orderBy: { name: 'asc' },
                    });
                    if (other) {
                        fallbackId = other.id;
                    } else {
                        const staff = await tx.employeeType.create({
                            data: { name: 'Staff' },
                        });
                        fallbackId = staff.id;
                    }
                }

                await tx.employee.updateMany({
                    where: { employee_type_id: id },
                    data: { employee_type_id: fallbackId },
                });
            }

            await tx.employeeType.delete({ where: { id } });
        });

        return { message: 'Designation deleted successfully' };
    }
}
