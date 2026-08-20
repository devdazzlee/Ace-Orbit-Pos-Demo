import { PrismaClient } from '@prisma/client';
import SupplierLedgerService from '../src/services/supplier-ledger.service';

const prisma = new PrismaClient();
const supplierLedgerService = new SupplierLedgerService();

async function main() {
  const supplier = await prisma.supplier.findFirst({
    where: { name: { contains: 'Ahmed Raza', mode: 'insensitive' } },
    select: { id: true, name: true },
  });

  if (!supplier) {
    console.log('Supplier not found');
    return;
  }

  console.log(`Repairing payment allocations for ${supplier.name}...`);
  await supplierLedgerService.getSupplierLedger({ supplierId: supplier.id, limit: 1 });
  console.log('Done — purchase payment_made rows realigned from ledger payments.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
