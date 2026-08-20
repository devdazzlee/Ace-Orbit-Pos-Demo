/**
 * Repair corrupted customer ledger rows (dry-run by default).
 *
 * Usage:
 *   npx ts-node scripts/repair-customer-ledger.ts "ALL IN ONE"
 *   npx ts-node scripts/repair-customer-ledger.ts "ALL IN ONE" --apply
 */
import { LedgerEntryType, Prisma, PrismaClient } from '@prisma/client';
import { ledgerBalanceEngine } from '../src/services/ledger-balance.engine';
import {
  buildSaleLedgerSnapshots,
} from '../src/utils/sale-ledger-derivation';
import {
  isSaleLinkedShadowAdjustment,
  isSaleManagedInSalePayment,
  saleUpfrontPaymentDescription,
} from '../src/utils/sale-ledger-revision';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const searchArg = process.argv.find(
  (a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1],
);

type RepairAction = { label: string; run: () => Promise<void> };

async function main() {
  const search = searchArg || 'ALL IN ONE';
  const customer = await prisma.customer.findFirst({
    where: {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { phone_number: { contains: search } },
        { mobile_number: { contains: search } },
      ],
    },
  });

  if (!customer) {
    console.log('Customer not found for:', search);
    return;
  }

  console.log(`=== REPAIR ${apply ? '(APPLY)' : '(DRY-RUN)'} ===`);
  console.log({ id: customer.id, name: customer.name });

  const [ledger, sales] = await Promise.all([
    prisma.customerLedger.findMany({
      where: { customer_id: customer.id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    }),
    prisma.sale.findMany({
      where: { customer_id: customer.id, status: 'COMPLETED', payment_method: 'CREDIT' },
      select: {
        id: true,
        sale_number: true,
        total_amount: true,
        payment_received: true,
        payment_status: true,
        sale_date: true,
        created_at: true,
        created_by: true,
      },
      orderBy: [{ sale_date: 'asc' }, { created_at: 'asc' }],
    }),
  ]);

  const actions: RepairAction[] = [];

  const phantomPayments = ledger.filter(
    (r) =>
      r.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
      (r.description?.toLowerCase().startsWith('paid on sale edit -') ?? false),
  );
  for (const payment of phantomPayments) {
    actions.push({
      label: `Delete phantom sale-edit payment ${payment.id} (${Number(payment.amount)} on ${payment.sale_id})`,
      run: async () => {
        await prisma.customerLedger.delete({ where: { id: payment.id } });
      },
    });
  }

  const shadowAdjustments = ledger.filter((r) => isSaleLinkedShadowAdjustment(r));
  for (const adj of shadowAdjustments) {
    actions.push({
      label: `Delete shadow adjustment ${adj.id} (${adj.description?.slice(0, 50)})`,
      run: async () => {
        await prisma.customerLedger.delete({ where: { id: adj.id } });
      },
    });
  }

  for (const sale of sales) {
    const saleRows = ledger.filter((r) => r.sale_id === sale.sale_number);
    const saleDate = sale.sale_date ?? sale.created_at;
    const total = Number(sale.total_amount);
    const paidOnSale = Number(sale.payment_received ?? 0);
    const createdBy = sale.created_by ?? 'repair-script';

    const salePhantom = phantomPayments.find((p) => p.sale_id === sale.sale_number);
    const hasCreditSale = saleRows.some((r) => r.entry_type === LedgerEntryType.CREDIT_SALE);
    const hasUpfront = saleRows.some(
      (r) =>
        isSaleManagedInSalePayment(r) &&
        !(r.description?.toLowerCase().startsWith('paid on sale edit -') ?? false),
    );
    const accountPayments = saleRows.filter(
      (r) =>
        r.entry_type === LedgerEntryType.PAYMENT_RECEIVED &&
        !isSaleManagedInSalePayment(r) &&
        !(r.description?.toLowerCase().startsWith('paid on sale edit -') ?? false),
    );

    if (!hasCreditSale) {
      const desc =
        paidOnSale > 0.009
          ? `Partial credit sale - ${sale.sale_number}`
          : `Credit sale - ${sale.sale_number}`;
      actions.push({
        label: `Create CREDIT_SALE ${sale.sale_number} for ${total} at ${saleDate.toISOString().slice(0, 10)}`,
        run: async () => {
          await prisma.customerLedger.create({
            data: {
              customer_id: customer.id,
              entry_type: LedgerEntryType.CREDIT_SALE,
              amount: new Prisma.Decimal(total),
              description: desc,
              sale_id: sale.sale_number,
              reference_no: sale.sale_number,
              balance_after: new Prisma.Decimal(0),
              created_at: saleDate,
              created_by: createdBy,
            },
          });
        },
      });
    }

    if (paidOnSale > 0.009 && !hasUpfront && accountPayments.length === 0) {
      if (salePhantom) {
        actions.push({
          label: `Restore payment ${Number(salePhantom.amount)} on ${sale.sale_number} (was phantom sale-edit)`,
          run: async () => {
            await prisma.customerLedger.create({
              data: {
                customer_id: customer.id,
                entry_type: LedgerEntryType.PAYMENT_RECEIVED,
                amount: salePhantom.amount,
                description: `Payment received against ${sale.sale_number}`,
                sale_id: sale.sale_number,
                reference_no: sale.sale_number,
                balance_after: new Prisma.Decimal(0),
                created_at: salePhantom.created_at,
                created_by: createdBy,
              },
            });
          },
        });
      } else {
        const upfrontAmount = Math.min(paidOnSale, total);
        actions.push({
          label: `Create upfront payment ${upfrontAmount} on ${sale.sale_number} at ${saleDate.toISOString().slice(0, 10)}`,
          run: async () => {
            await prisma.customerLedger.create({
              data: {
                customer_id: customer.id,
                entry_type: LedgerEntryType.PAYMENT_RECEIVED,
                amount: new Prisma.Decimal(upfrontAmount),
                description: saleUpfrontPaymentDescription(sale.sale_number),
                sale_id: sale.sale_number,
                reference_no: sale.sale_number,
                balance_after: new Prisma.Decimal(0),
                created_at: saleDate,
                created_by: createdBy,
              },
            });
          },
        });
      }
    }
  }

  actions.push({
    label: 'Recalculate running balances and sync sale payment fields from ledger',
    run: async () => {
      await prisma.$transaction(async (tx) => {
        await ledgerBalanceEngine.recalculateRunningBalances(tx, customer.id);

        const refreshedLedger = await tx.customerLedger.findMany({
          where: { customer_id: customer.id },
          select: { sale_id: true, entry_type: true, amount: true, description: true },
        });
        const snapshots = buildSaleLedgerSnapshots(refreshedLedger, sales);
        for (const sale of sales) {
          const snap = snapshots.get(sale.sale_number)!;
          await tx.sale.update({
            where: { id: sale.id },
            data: {
              payment_received: new Prisma.Decimal(snap.upfrontPaid),
              payment_status: snap.paymentStatus,
            },
          });
        }
      });
    },
  });

  if (actions.length === 0) {
    console.log('No repair actions proposed.');
    return;
  }

  console.log('\nProposed actions:');
  for (const [i, action] of actions.entries()) {
    console.log(`  ${i + 1}. ${action.label}`);
  }

  if (!apply) {
    console.log('\nRe-run with --apply to execute.');
    return;
  }

  for (const action of actions) {
    console.log(`\nExecuting: ${action.label}`);
    await action.run();
  }

  const balance = await ledgerBalanceEngine.syncCustomerBalances(customer.id);
  console.log('\nRepair complete. New balance:', balance);

  const after = await prisma.customerLedger.findMany({
    where: { customer_id: customer.id },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });
  console.log('\nLedger after repair:', after.length, 'rows');
  for (const r of after) {
    console.log(
      r.created_at.toISOString().slice(0, 10),
      r.entry_type,
      Number(r.amount),
      r.sale_id ?? '-',
      (r.description ?? '').slice(0, 55),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
