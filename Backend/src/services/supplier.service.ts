import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateSupplierInput, UpdateSupplierInput } from '../validations/supplier.validation';

export class SupplierService {
    /** Next numeric supplier code (1000, 1001, …) based on highest existing code. */
    private async generateNextSupplierCode(): Promise<string> {
        const suppliers = await prisma.supplier.findMany({ select: { code: true } });
        let maxNum = 999;
        for (const { code } of suppliers) {
            const n = Number.parseInt(code, 10);
            if (!Number.isNaN(n) && n > maxNum) maxNum = n;
        }
        return String(maxNum + 1);
    }

    async createSupplier(data: CreateSupplierInput) {
        const existingSupplier = await prisma.supplier.findFirst({
            where: { name: data.name },
        });

        if (existingSupplier) throw new AppError(400, 'Supplier already exists');

        const newCode = await this.generateNextSupplierCode();

        const supplier = await prisma.supplier.create({
            data: {
                ...data,
                code: newCode,
            },
        });

        return supplier;
    }

    async getSupplierById(id: string) {
        const supplier = await prisma.supplier.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!supplier) throw new AppError(404, 'Supplier not found');
        return supplier;
    }

    async updateSupplier(id: string, data: UpdateSupplierInput) {
        await this.getSupplierById(id); // Verify exists
        return prisma.supplier.update({
            where: { id },
            data,
        });
    }

    async toggleSupplierStatus(id: string) {
        const supplier = await this.getSupplierById(id);
        const newStatus = supplier.status === 'active' ? 'inactive' : 'active';
        return prisma.supplier.update({
            where: { id },
            data: { status: newStatus },
        });
    }

    async deleteSupplier(id: string) {
        const supplier = await prisma.supplier.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { products: true }
                }
            }
        });

        if (!supplier) throw new AppError(404, 'Supplier not found');
        if (supplier._count.products > 0) {
            throw new AppError(400, 'Cannot delete supplier with associated products. Please reassign or delete the products first.');
        }

        return prisma.supplier.delete({
            where: { id },
        });
    }

    async listSuppliers({
        page = 1,
        limit = 100,
        search,
        is_active,
        display_on_pos,
    }: {
        page?: number;
        limit?: number;
        search?: string;
        is_active?: boolean;
        display_on_pos?: boolean;
    } = {}) {
        const where: Prisma.SupplierWhereInput = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { phone_number: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (is_active !== undefined) {
            where.is_active = is_active;
        }

        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }

        const [suppliers, total] = await Promise.all([
            prisma.supplier.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    _count: {
                        select: { products: true },
                    },
                },
            }),
            prisma.supplier.count({ where }),
        ]);

        return {
            data: suppliers.map(s => ({
                ...s,
                product_count: s._count.products,
                _count: undefined,
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}