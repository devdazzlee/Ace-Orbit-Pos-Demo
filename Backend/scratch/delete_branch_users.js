const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanUsers() {
    const adminEmail = 'admin@sarwattraders.com';
    let admin = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (!admin) {
        console.error("Critical: No admin found.");
        return;
    }

    console.log("Upgrading admin to global SUPER_ADMIN with no specific branch restrictions...");
    admin = await prisma.user.update({
        where: { id: admin.id },
        data: { role: 'SUPER_ADMIN', branch_id: null }
    });

    const otherUsers = await prisma.user.findMany({
        where: { id: { not: admin.id } }
    });

    console.log(`Found ${otherUsers.length} branch users to delete.`);

    for (const u of otherUsers) {
        console.log(`Transferring data and deleting user: ${u.email}`);
        
        // Transfer all records where created_by / updated_by exists
        try { await prisma.sale.updateMany({ where: { created_by: u.id }, data: { created_by: admin.id } }); } catch(e){}
        try { await prisma.holdSale.updateMany({ where: { created_by: u.id }, data: { created_by: admin.id } }); } catch(e){}
        try { await prisma.purchaseOrder.updateMany({ where: { created_by: u.id }, data: { created_by: admin.id } }); } catch(e){}
        try { await prisma.stockMovement.updateMany({ where: { created_by: u.id }, data: { created_by: admin.id } }); } catch(e){}
        try { await prisma.purchase.updateMany({ where: { created_by: u.id }, data: { created_by: admin.id } }); } catch(e){}
        try { await prisma.transfer.updateMany({ where: { transferred_by_id: u.id }, data: { transferred_by_id: admin.id } }); } catch(e){}
        try { await prisma.transfer.updateMany({ where: { received_by_id: u.id }, data: { received_by_id: admin.id } }); } catch(e){}
        try { await prisma.stockAdjustment.updateMany({ where: { adjusted_by_id: u.id }, data: { adjusted_by_id: admin.id } }); } catch(e){}

        // Delete user
        await prisma.user.delete({ where: { id: u.id } });
        console.log(`Successfully deleted ${u.email}`);
    }
}

cleanUsers().then(() => {
    console.log("All branch users removed successfully.");
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
