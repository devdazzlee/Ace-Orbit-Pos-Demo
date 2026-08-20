import { PrismaClient, SupplierLedgerEntryType } from '@prisma/client';
import { supplierLedgerBalanceEngine } from '../src/services/supplier-ledger-balance.engine';

const prisma = new PrismaClient();

async function main() {
  const supplier = await prisma.supplier.findFirst({
    where: { name: { contains: 'Ahmed Raza', mode: 'insensitive' } },
    select: {
      id: true,
      name: true,
      code: true,
      outstanding_balance: true,
    },
  });

  if (!supplier) {
    console.log('Supplier "Ahmed Raza" not found');
    return;
  }

  const entries = await prisma.supplierLedger.findMany({
    where: { supplier_id: supplier.id },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });

  console.log('=== SUPPLIER ===');
  console.log({
    name: supplier.name,
    code: supplier.code,
    outstanding_balance: Number(supplier.outstanding_balance),
  });

  console.log('\n=== LEDGER (chronological) ===');
  let running = 0;
  let totalPurchases = 0;
  let totalPaid = 0;
  let totalCash = 0;

  for (const e of entries) {
    const before = running;
    const delta = supplierLedgerBalanceEngine.computeSignedDelta(e, before);
    running = Number((running + delta).toFixed(3));
    const stored = Number(e.balance_after);
    const amt = Number(e.amount);

    if (e.entry_type === SupplierLedgerEntryType.CREDIT_PURCHASE || e.entry_type === SupplierLedgerEntryType.CASH_PURCHASE) {
      totalPurchases += amt;
    }
    if (e.entry_type === SupplierLedgerEntryType.CASH_PURCHASE) totalCash += amt;
    if (e.entry_type === SupplierLedgerEntryType.PAYMENT_MADE) totalPaid += amt;

    const chainOk = Math.abs(before + delta - running) <= 0.009;
    const storedOk = Math.abs(stored - running) <= 0.009;

    console.log({
      at: e.created_at.toISOString(),
      type: e.entry_type,
      amount: amt,
      before,
      delta,
      computed_after: running,
      stored_balance_after: stored,
      chain_ok: chainOk,
      stored_matches_computed: storedOk,
      description: e.description?.slice(0, 70),
    });
  }

  const computed = supplierLedgerBalanceEngine.computeRunningBalance(entries);
  const balanceDue = Math.max(0, computed);
  const advanceBalance = Math.max(0, -computed);

  console.log('\n=== SUMMARY CHECK ===');
  console.log({
    entry_count: entries.length,
    computed_running_balance: computed,
    supplier_outstanding_balance: Number(supplier.outstanding_balance),
    outstanding_matches: Math.abs(computed - Number(supplier.outstanding_balance)) <= 0.009,
    total_purchases: totalPurchases,
    total_payments: totalPaid,
    total_cash_purchases: totalCash,
    total_paid_card: totalPaid + totalCash,
    balance_due: balanceDue,
    advance_balance: advanceBalance,
  });

  const creditPurchases = await prisma.purchase.findMany({
    where: { supplier_id: supplier.id, payment_method: 'CREDIT' },
    select: {
      purchase_number: true,
      quantity: true,
      cost_price: true,
      payment_made: true,
      payment_status: true,
    },
  });

  console.log('\n=== CREDIT PURCHASE PAYMENT ALLOCATION ===');
  for (const p of creditPurchases) {
    const lineTotal = Number(p.quantity) * Number(p.cost_price);
    console.log({
      purchase_number: p.purchase_number,
      line_total: lineTotal,
      payment_made: Number(p.payment_made),
      due: lineTotal - Number(p.payment_made),
      payment_status: p.payment_status,
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
