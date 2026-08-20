const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
    const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
    console.log(users);
}
checkUsers().finally(() => process.exit(0));
