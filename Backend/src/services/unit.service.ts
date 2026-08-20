import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateUnitInput, UpdateUnitInput } from '../validations/unit.validation';

export class UnitService {
    async createUnit(data: CreateUnitInput) {
        const [existingUnit, lastUnit] = await Promise.all([
            prisma.unit.findFirst({
                where: {
                    name: data.name,
                },
            }),
            prisma.unit.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true },
            }),
        ]);

        if (existingUnit) throw new AppError(400, 'Unit already exists');

        const newCode = lastUnit ? (parseInt(lastUnit.code) + 1).toString() : '1000';

        const unit = await prisma.unit.create({
            data: {
                ...data,
                code: newCode
            },
        });

        return unit;
    }

    async getUnitById(id: string) {
        const unit = await prisma.unit.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!unit) throw new AppError(404, 'Unit not found');
        return unit;
    }

    async updateUnit(id: string, data: UpdateUnitInput) {
        await this.getUnitById(id);
        return prisma.unit.update({
            where: { id },
            data,
        });
    }

    async deleteUnit(id: string) {
        await this.getUnitById(id);
        return prisma.unit.delete({ where: { id } });
    }

    async listUnits({
        page = 1,
        limit = 10,
        search,
        is_active,
        display_on_pos = true,
    }: {
        page?: number;
        limit?: number;
        search?: string;
        is_active?: boolean;
        display_on_pos?: boolean;
    }) {
        const where: Prisma.UnitWhereInput = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (is_active !== undefined) {
            where.is_active = is_active;
        }

        if (display_on_pos !== undefined) {
            where.display_on_pos = display_on_pos;
        }

        const [units, total] = await Promise.all([
            prisma.unit.findMany({
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
            prisma.unit.count({ where }),
        ]);

        return {
            data: units.map(u => ({
                ...u,
                product_count: u._count.products,
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