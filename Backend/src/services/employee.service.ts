import { prisma } from '../prisma/client';
import { CreateEmployeeInput } from '../validations/employee.validation';
import { AppError } from '../utils/apiError';

const DEFAULT_EMPLOYEE_TYPE_NAME = 'General';

export class EmployeeService {
  private async resolveDefaultEmployeeTypeId(): Promise<string> {
    const existing = await prisma.employeeType.findFirst({
      where: { name: DEFAULT_EMPLOYEE_TYPE_NAME },
    });
    if (existing) return existing.id;

    const created = await prisma.employeeType.create({
      data: { name: DEFAULT_EMPLOYEE_TYPE_NAME },
    });
    return created.id;
  }

  async createEmployee(data: CreateEmployeeInput, branch_id: string) {
    const email = data.email.trim().toLowerCase();
    const duplicate = await prisma.employee.findFirst({ where: { email } });
    if (duplicate) {
      throw new AppError(400, 'An employee with this email already exists');
    }

    const employee_type_id =
      data.employee_type_id ?? (await this.resolveDefaultEmployeeTypeId());
    const join_date = data.join_date ? new Date(data.join_date) : new Date();

    const employee = await prisma.employee.create({
      data: {
        name: data.name.trim(),
        email,
        phone_number: data.phone_number?.trim() || null,
        cnic: data.cnic?.trim() || null,
        gender: data.gender?.trim() || null,
        join_date,
        employee_type_id,
        branch_id,
      },
    });
    return employee;
  }

  async listEmployees(branch_id: string, page = 1, limit = 10) {
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where: { branch_id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { employee_type: { select: { id: true, name: true } } },
      }),
      prisma.employee.count({ where: { branch_id } }),
    ]);

    return {
      data: employees,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateEmployee(id: string, data: Partial<CreateEmployeeInput>) {
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Employee not found');

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.email !== undefined) {
      const email = data.email.trim().toLowerCase();
      const duplicate = await prisma.employee.findFirst({
        where: { email, NOT: { id } },
      });
      if (duplicate) {
        throw new AppError(400, 'An employee with this email already exists');
      }
      updateData.email = email;
    }
    if (data.phone_number !== undefined) {
      updateData.phone_number = data.phone_number?.trim() || null;
    }
    if (data.cnic !== undefined) updateData.cnic = data.cnic?.trim() || null;
    if (data.gender !== undefined) updateData.gender = data.gender?.trim() || null;
    if (data.join_date !== undefined && data.join_date) {
      updateData.join_date = new Date(data.join_date);
    }
    if (data.employee_type_id !== undefined && data.employee_type_id) {
      updateData.employee_type_id = data.employee_type_id;
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: updateData,
    });
    return employee;
  }

  async deleteEmployee(id: string) {
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new AppError(404, 'Employee not found');
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.salary.deleteMany({ where: { employee_id: id } });
        await tx.shiftAssignment.deleteMany({ where: { employee_id: id } });
        await tx.employee.delete({ where: { id } });
      },
      { maxWait: 15_000, timeout: 60_000 },
    );

    return { message: 'Employee deleted successfully' };
  }
}
