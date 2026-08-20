import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/apiError';
import { CreateBrandInput, UpdateBrandInput } from '../validations/brand.validation';

export class BrandService {
    async createBrand(data: CreateBrandInput) {
        const existingBrand = await prisma.brand.findFirst({
            where: { name: data.name },
        });
        if (existingBrand) {
            throw new AppError(400, 'Brand with this name already exists');
        }
        const lastBrand = await prisma.brand.findFirst({
            orderBy: { created_at: 'desc' },
            select: { code: true },
        });

        const newCode = lastBrand ? (parseInt(lastBrand.code) + 1).toString() : '1000';

        return prisma.brand.create({
            data: {
                ...data,
                code: newCode,
            },
        });
    }

    async getBrandById(id: string) {
        const brand = await prisma.brand.findUnique({
            where: { id },
            include: {
                products: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!brand) throw new AppError(404, 'Brand not found');
        return brand;
    }

    async updateBrand(id: string, data: UpdateBrandInput) {
        await this.getBrandById(id); // Verify exists
        return prisma.brand.update({
            where: { id },
            data,
        });
    }

    async deleteBrand(id: string) {
        await this.getBrandById(id);
        return prisma.brand.delete({ where: { id } });
    }

    async toggleBrandDisplay(id: string) {
        const brand = await this.getBrandById(id);
        return prisma.brand.update({
            where: { id },
            data: { display_on_pos: !brand.display_on_pos },
        });
    }

    async listBrands({
        page = 1,
        limit = 10,
        search,
    }: {
        page?: number;
        limit?: number;
        search?: string;
    }) {
        const where: Prisma.BrandWhereInput = {};

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [brands, total] = await Promise.all([
            prisma.brand.findMany({
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
            prisma.brand.count({ where }),
        ]);

        return {
            data: brands.map(b => ({
                ...b,
                product_count: b._count.products,
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