import { prisma } from '../prisma/client';
import {
  getCurrentReportingPeriod,
  getReportingPeriodCreatedAtFilter,
  getReportingPeriodForCalendarDate,
} from '../utils/reportingPeriod';

export class CashFlowService {
  private openedAtFilterForPeriod(start: Date, end: Date) {
    return {
      gte: start,
      lt: end,
    };
  }

  async getCashFlowByDate(branch_id: string, date: string) {
    console.log('getCashFlowByDate - received params:', { branch_id, date });

    const { start, end } = getReportingPeriodForCalendarDate(date);

    console.log('getCashFlowByDate - searching by reporting period:', {
      branch_id,
      date,
      start: start.toISOString(),
      end: end.toISOString(),
    });

    const allCashFlowsForBranch = await prisma.cashFlow.findMany({
      where: { branch_id },
      select: {
        id: true,
        opened_at: true,
        status: true,
        created_at: true,
      },
      orderBy: { opened_at: 'desc' },
      take: 10,
    });
    console.log('All cashflows for this branch:', allCashFlowsForBranch);

    const cashFlow = await prisma.cashFlow.findFirst({
      where: {
        branch_id,
        opened_at: this.openedAtFilterForPeriod(start, end),
      },
      include: { expenses: true },
    });

    console.log('getCashFlowByDate - found by date:', cashFlow);

    if (!cashFlow) {
      console.log('getCashFlowByDate - no cashflow found, returning exists: false');
      return { exists: false, data: null };
    }

    console.log('getCashFlowByDate - cashflow found, returning exists: true');
    return { exists: true, data: cashFlow };
  }

  async createOpeningCashFlow(data: { opening: number; sales: number; branch_id: string }) {
    const cashFlow = await prisma.cashFlow.create({
      data: {
        opening: data.opening,
        sales: data.sales,
        closing: null,
        branch_id: data.branch_id,
        status: 'OPEN',
        opened_at: new Date(),
      },
    });

    return cashFlow;
  }

  async addExpense(data: {
    cashflow_id: string;
    particular: string;
    amount: number;
  }) {
    const expense = await prisma.expense.create({
      data: {
        particular: data.particular,
        amount: data.amount,
        cashflow_id: data.cashflow_id,
      },
    });

    return expense;
  }

  async addClosing(cashflow_id: string, closing: number) {
    const updated = await prisma.cashFlow.update({
      where: { id: cashflow_id },
      data: {
        closing,
        status: 'CLOSED',
        closed_at: new Date(),
      },
    });

    return updated;
  }

  async listCashFlows({
    page = 1,
    limit = 10,
    branch_id,
  }: {
    page?: number;
    limit?: number;
    branch_id?: string;
  }) {
    const whereClause = branch_id ? { branch_id } : {};

    const [cashFlows, total] = await Promise.all([
      prisma.cashFlow.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { expenses: true },
      }),
      prisma.cashFlow.count({ where: whereClause }),
    ]);

    return {
      data: cashFlows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOpenDrawer(branch_id: string) {
    const { gte, lt } = getReportingPeriodCreatedAtFilter();

    console.log('findOpenDrawer - searching for:', { branch_id, gte, lt });

    const result = await prisma.cashFlow.findFirst({
      where: {
        branch_id,
        status: 'OPEN',
        opened_at: { gte, lt },
      },
    });

    console.log('findOpenDrawer - found:', result);
    return result;
  }

  async findAnyDrawerToday(branch_id: string) {
    const { gte, lt } = getReportingPeriodCreatedAtFilter();

    console.log('findAnyDrawerToday - searching for:', {
      branch_id,
      gte: gte.toISOString(),
      lt: lt.toISOString(),
    });

    const result = await prisma.cashFlow.findFirst({
      where: {
        branch_id,
        opened_at: { gte, lt },
      },
    });

    console.log('findAnyDrawerToday - found:', result);
    return result;
  }

  async getExpensesByDate(branch_id: string, date?: string) {
    console.log('getExpensesByDate - received params:', { branch_id, date });

    let cashFlow = await prisma.cashFlow.findFirst({
      where: {
        branch_id,
        status: 'OPEN',
      },
      include: { expenses: true },
    });

    if (cashFlow) {
      console.log(
        'getExpensesByDate - found open drawer with expenses:',
        cashFlow.expenses?.length || 0,
      );
      return cashFlow.expenses || [];
    }

    const period = date
      ? getReportingPeriodForCalendarDate(date)
      : getCurrentReportingPeriod();

    console.log('getExpensesByDate - searching by reporting period:', {
      branch_id,
      date,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    });

    cashFlow = await prisma.cashFlow.findFirst({
      where: {
        branch_id,
        opened_at: this.openedAtFilterForPeriod(period.start, period.end),
      },
      include: { expenses: true },
    });

    console.log('getExpensesByDate - found by date:', cashFlow);
    return cashFlow?.expenses || [];
  }
}
