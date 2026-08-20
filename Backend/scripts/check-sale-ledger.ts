import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const saleNumber = 'SALE-1780648824737';
  const sale = await prisma.sale.findFirst({
    where: { sale_number: saleNumber },
    include: {
      sale_items: true,
      customer: { select: { id: true, name: true, outstanding_balance: true } },
    },
  });

  console.log('=== SALE ===');
  if (!sale) {
    console.log('Sale not found');
    return;
  }

  console.log({
    sale_number: sale.sale_number,
    customer: sale.customer?.name,
    customer_id: sale.customer_id,
    total_amount: sale.total_amount.toString(),
    payment_received: sale.payment_received.toString(),
    payment_method: sale.payment_method,
    payment_status: sale.payment_status,
    discount_amount: sale.discount_amount?.toString(),
    subtotal: sale.subtotal?.toString(),
  });

  const ledger = await prisma.customerLedger.findMany({
    where: { customer_id: sale.customer_id! },
    orderBy: { created_at: 'asc' },
  });

  console.log('\n=== LEDGER (chronological) ===');
  let prev = 0;
  for (const e of ledger) {
    const amt = Number(e.amount);
    const bal = Number(e.balance_after);
    const delta = bal - prev;
    console.log({
      date: e.created_at.toISOString(),
      type: e.entry_type,
      amount: amt,
      balance_after: bal,
      delta_from_prev: delta,
      sale_id: e.sale_id,
      description: e.description,
    });
    prev = bal;
  }

  console.log('\n=== CUSTOMER BALANCE ===');
  const cust = await prisma.customer.findUnique({
    where: { id: sale.customer_id! },
    select: { name: true, outstanding_balance: true },
  });
  console.log({
    name: cust?.name,
    outstanding_balance: cust?.outstanding_balance.toString(),
  });

  const lastLedger = ledger[ledger.length - 1];
  console.log('\n=== SYNC CHECK ===');
  console.log({
    last_ledger_balance: lastLedger ? Number(lastLedger.balance_after) : 0,
    customer_outstanding: cust ? Number(cust.outstanding_balance) : 0,
    mismatch: lastLedger
      ? Number(lastLedger.balance_after) - Number(cust?.outstanding_balance ?? 0)
      : 0,
  });
  const related = ledger.filter((e) => e.sale_id === saleNumber || e.description?.includes(saleNumber));
  console.log('\n=== ENTRIES FOR THIS SALE ===');
  console.log(JSON.stringify(related, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
