import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateColorInput, UpdateColorInput } from '../validations/color.validation';

export class ColorService {
    async createColor(data: CreateColorInput) {
        const [existingColor, lastColor] = await Promise.all([
            prisma.color.findFirst({
                where: {
                    name: data.name,
                },
            }),
            prisma.color.findFirst({
                orderBy: { created_at: 'desc' },
                select: { code: true },
            }),
        ]);

        if (existingColor) throw new AppError(400, 'Color already exists');

        const newCode = lastColor ? (parseInt(lastColor.code) + 1).toString() : '1000';

        const color = await prisma.color.create({
            data: {
                ...data,
                code: newCode
            },
        });

        return color;
    }

    async getColorById(id: string) {
        const color = await prisma.color.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!color) throw new AppError(404, 'Color not found');
        return color;
    }

    async updateColor(id: string, data: UpdateColorInput) {
        await this.getColorById(id); // Verify exists
        return prisma.color.update({
            where: { id },
            data,
        });
    }

    async deleteColor(id: string) {
        await this.getColorById(id);
        return prisma.color.delete({ where: { id } });
    }

    async listColors({
        page = 1,
        limit = 10,
        search,
    }: {
        page?: number;
        limit?: number;
        search?: string;
    }) {
        const where: Prisma.ColorWhereInput = {};

        if (search) {
            // Use OR condition for search
            where.AND = [
                { is_active: true }, // Only active colors
                {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { code: { contains: search, mode: 'insensitive' } },
                    ],
                },
            ];
        }

        const [colors, total] = await Promise.all([
            prisma.color.findMany({
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
            prisma.color.count({ where }),
        ]);

        return {
            data: colors.map(c => ({
                ...c,
                product_count: c._count.products,
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