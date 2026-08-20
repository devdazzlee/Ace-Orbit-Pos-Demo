import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Ace Orbits admin user...');

  await prisma.user.deleteMany({
    where: {
      email: 'admin@aceorbits.com',
    },
  });

  const password = await bcrypt.hash('AceOrbits@123', 10);

  await prisma.user.create({
    data: {
      email: 'admin@aceorbits.com',
      password: password,
      role: Role.ADMIN,
    },
  });

  console.log('Admin user created: admin@aceorbits.com');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
