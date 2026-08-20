import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🗑️ Deleting all products and related records...');
    
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Delete related records first due to foreign key constraints
            await tx.productImage.deleteMany({});
            await tx.stockMovement.deleteMany({});
            await tx.stock.deleteMany({});
            await tx.saleItem.deleteMany({});
            await tx.purchaseOrderItem.deleteMany({});
            await tx.orderItem.deleteMany({});
            await tx.purchase.deleteMany({});
            await tx.transfer.deleteMany({});
            await tx.stockAdjustment.deleteMany({});
            
            // 2. Finally, delete all Products
            const deleted = await tx.product.deleteMany({});
            console.log(`✅ Successfully deleted ${deleted.count} products.`);
        });
    } catch (error) {
        console.error('❌ Error deleting products:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
