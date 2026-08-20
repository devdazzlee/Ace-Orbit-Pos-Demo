const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🗑️ Deleting all products and related records...');
    
    try {
        await prisma.$transaction([
            prisma.productImage.deleteMany(),
            prisma.stockMovement.deleteMany(),
            prisma.stock.deleteMany(),
            prisma.saleItem.deleteMany(),
            prisma.purchaseOrderItem.deleteMany(),
            prisma.orderItem.deleteMany(),
            prisma.purchase.deleteMany(),
            prisma.transfer.deleteMany(),
            prisma.stockAdjustment.deleteMany(),
            prisma.product.deleteMany()
        ]);
        console.log('✅ Successfully deleted all products and related data.');
    } catch (error) {
        console.error('❌ Error deleting products:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
