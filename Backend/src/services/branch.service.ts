import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateBranchInput, UpdateBranchInput } from '../validations/branch.validation';
import { getReportingPeriodCreatedAtFilter } from '../utils/reportingPeriod';

export class BranchService {
  public async createBranch(data: CreateBranchInput) {
    const lastBranch = await prisma.branch.findFirst({
      orderBy: {
        created_at: 'desc',
      },
    });

    const code = lastBranch ? (parseInt(lastBranch.code) + 1).toString() : '1000';

    const branch = await prisma.branch.create({
      data: {
        ...data,
        code,
      },
    });

    return branch;
  }

  public async getBranchById(id: string) {
    const branch = await prisma.branch.findUnique({
      where: {
        id,
      },
    });

    if (!branch) {
      throw new AppError(404, 'Branch not found');
    }

    return branch;
  }

  public async updateBranch(id: string, data: UpdateBranchInput) {
    const branch = await prisma.branch.findUnique({
      where: {
        id,
      },
    });

    if (!branch) {
      throw new AppError(404, 'Branch not found');
    }

    const updatedBranch = await prisma.branch.update({
      where: {
        id,
      },
      data,
    });

    return updatedBranch;
  }

  public async toggleBranchStatus(id: string) {
    // Check if branch exists
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new AppError(404, 'Branch not found');
    }
    // Toggle the is_active status
    const updatedBranch = await prisma.branch.update({
      where: { id },
      data: { is_active: !branch.is_active },
    });
    console.log('Updated Branch:', updatedBranch, 'is_active:', updatedBranch.is_active, branch);
    return updatedBranch;
  }

  public async listBranches({
    page = 1,
    limit = 10,
    search,
    is_active = true,
    fetch_all,
  }: {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
    fetch_all?: boolean;
  }) {
    const where: Prisma.BranchWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (is_active !== undefined) {
      where.is_active = is_active;
    }

    const take = fetch_all ? 1000 : limit;
    const skip = fetch_all ? 0 : (page - 1) * limit;

    const [total, branches] = await Promise.all([
      prisma.branch.count({ where }),
      prisma.branch.findMany({
        where,
        skip,
        take,
        orderBy: {
          created_at: 'desc',
        },
      }),
    ]);

    return {
      data: branches,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async getBranchDetails(branchId: string) {
    const { gte, lt } = getReportingPeriodCreatedAtFilter();

    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        employees: {
          where: { is_active: true },
          include: {
            employee_type: true,
          },
        },
        sales: {
          where: {
            created_at: {
              gte,
              lt,
            },
          },
          select: {
            id: true,
            sale_number: true,
            total_amount: true,
            sale_date: true,
            payment_method: true,
            status: true,
          },
        },
      },
    });

    if (!branch) {
      throw new Error('Branch not found');
    }

    return branch;
  }
}
