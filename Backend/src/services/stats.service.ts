import { LedgerEntryType, Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
    getCurrentReportingPeriod,
    getReportingPeriodCreatedAtFilter,
} from "../utils/reportingPeriod";

export class StatsService {
    private saleBaseWhere(
        branchId?: string,
        periodStart?: Date,
        periodEnd?: Date,
    ): Prisma.SaleWhereInput {
        const range = this.resolveCreatedAtRange(periodStart, periodEnd);

        return {
            status: "COMPLETED",
            ...(range ? { created_at: range } : {}),
            ...(branchId && branchId !== "Not Found" ? { branch_id: branchId } : {}),
        };
    }

    private resolveCreatedAtRange(
        startDate?: Date,
        endDate?: Date,
    ): Prisma.DateTimeFilter | undefined {
        if (startDate || endDate) {
            return {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lt: endDate } : {}),
            };
        }

        return getReportingPeriodCreatedAtFilter();
    }

    private async totalCustomers(branchId?: string) {
        const total = await prisma.customer.count();
        return total;
    }

    private async lowStockProducts(branchId?: string) {
        const lowStock = await prisma.stock.findMany({
            where: {
                current_quantity: {
                    lt: 10,
                },
                product: {
                    is_active: true,
                },
                ...(branchId && branchId !== "Not Found" ? { branch_id: branchId } : {}),
            },
            select: {
                id: true,
                current_quantity: true,
                product_id: true,
                product: {
                    select: {
                        name: true,
                        sku: true,
                        is_active: true,
                    },
                },
            },
        });
        return lowStock;
    }

    private async todaySales(branchId?: string) {
        const { gte, lt } = getReportingPeriodCreatedAtFilter();

        const sales = await prisma.sale.findMany({
            where: this.saleBaseWhere(branchId, gte, lt),
            select: {
                id: true,
                total_amount: true,
                sale_number: true,
                status: true,
                payment_method: true,
                sale_date: true,
                created_at: true,
                customer: {
                    select: {
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                created_at: "desc",
            },
        });

        return sales;
    }

    private async dailyRevenue(branchId?: string) {
        const { gte, lt } = getReportingPeriodCreatedAtFilter();
        const revenue = await prisma.sale.aggregate({
            _sum: { total_amount: true },
            where: this.saleBaseWhere(branchId, gte, lt),
        });
        return revenue._sum.total_amount ? Number(revenue._sum.total_amount) : 0;
    }

    private async dailyCredit(branchId?: string) {
        const { gte, lt } = getReportingPeriodCreatedAtFilter();
        const credit = await prisma.sale.aggregate({
            _sum: { total_amount: true },
            where: {
                ...this.saleBaseWhere(branchId, gte, lt),
                payment_method: "CREDIT",
            },
        });
        return credit._sum.total_amount ? Number(credit._sum.total_amount) : 0;
    }

    private async dailyCash(branchId?: string) {
        const { gte, lt } = getReportingPeriodCreatedAtFilter();
        const cash = await prisma.sale.aggregate({
            _sum: { total_amount: true },
            where: {
                ...this.saleBaseWhere(branchId, gte, lt),
                payment_method: { in: ["CASH", "CARD"] },
            },
        });
        return cash._sum.total_amount ? Number(cash._sum.total_amount) : 0;
    }

    private collectionsWhere(
        startDate?: Date,
        endDate?: Date,
        endExclusive = true,
    ): Prisma.CustomerLedgerWhereInput {
        const period = getCurrentReportingPeriod();
        const start = startDate ?? period.start;
        const end = endDate ?? period.end;
        const useExclusiveEnd = endDate ? endExclusive : true;

        return {
            entry_type: LedgerEntryType.PAYMENT_RECEIVED,
            created_at: {
                gte: start,
                ...(end
                    ? useExclusiveEnd
                        ? { lt: end }
                        : { lte: end }
                    : {}),
            },
        };
    }

    private async dailyCollections(startDate?: Date, endDate?: Date) {
        const collections = await prisma.customerLedger.aggregate({
            _sum: { amount: true },
            where: this.collectionsWhere(startDate, endDate),
        });
        return collections._sum.amount ? Number(collections._sum.amount) : 0;
    }

    async getCollectionEntries({
        startDate,
        endDate,
        search,
        endExclusive = true,
    }: {
        startDate?: Date;
        endDate?: Date;
        search?: string;
        endExclusive?: boolean;
    }) {
        const rows = await prisma.customerLedger.findMany({
            where: this.collectionsWhere(startDate, endDate, endExclusive),
            select: {
                id: true,
                amount: true,
                description: true,
                reference_no: true,
                created_at: true,
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone_number: true,
                    },
                },
            },
            orderBy: { created_at: "desc" },
        });

        if (!search?.trim()) return rows;

        const q = search.trim().toLowerCase();
        return rows.filter((row) => {
            const haystack = [
                row.customer?.name,
                row.customer?.phone_number,
                row.description,
                row.reference_no,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(q);
        });
    }

    private async dailyExpense(branchId?: string) {
        const { gte, lt } = getReportingPeriodCreatedAtFilter();
        const expenses = await prisma.expense.aggregate({
            _sum: { amount: true },
            where: {
                created_at: { gte, lt },
                ...(branchId && branchId !== "Not Found" ? { cashflow: { branch_id: branchId } } : {}),
            },
        });
        return expenses._sum.amount ? Number(expenses._sum.amount) : 0;
    }

    public async getDashboardStats(branchId?: string) {
        const reportingPeriod = getCurrentReportingPeriod();

        const [
            totalCustomers,
            lowStockProducts,
            todaySales,
            dailyRevenue,
            dailyCredit,
            dailyCash,
            dailyCollections,
            dailyExpense,
        ] = await Promise.all([
            this.totalCustomers(branchId),
            this.lowStockProducts(branchId),
            this.todaySales(branchId),
            this.dailyRevenue(branchId),
            this.dailyCredit(branchId),
            this.dailyCash(branchId),
            this.dailyCollections(),
            this.dailyExpense(branchId),
        ]);

        const cashReceived = dailyCash + dailyCollections;

        return {
            totalCustomers,
            lowStockProducts,
            todaySales,
            dailyRevenue,
            dailyCredit,
            dailyCash,
            dailyCollections,
            dailyCashReceived: cashReceived,
            dailyExpense,
            reportingPeriod: {
                start: reportingPeriod.start.toISOString(),
                end: reportingPeriod.end.toISOString(),
            },
        };
    }
}
