import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const cid = '03729648-1e52-47da-af57-85add0382a10';

async function main() {
  const sales = await prisma.sale.findMany({
    where: { customer_id: cid },
    include: { sale_items: { include: { product: { select: { name: true } } } } },
    orderBy: { created_at: 'asc' },
  });
  for (const s of sales) {
    console.log('---', s.sale_number, '---');
    console.log({
      created: s.created_at.toISOString(),
      updated: s.updated_at.toISOString(),
      total: Number(s.total_amount),
      paid: Number(s.payment_received),
      method: s.payment_method,
      status: s.payment_status,
      created_by: s.created_by,
      notes: s.notes,
    });
    console.log(
      'items:',
      s.sale_items.map((i) => ({
        name: i.product.name,
        qty: Number(i.quantity),
        price: Number(i.unit_price),
        line: Number(i.line_total),
      })),
    );
  }

  const payments = await prisma.customerLedger.findMany({
    where: { customer_id: cid, entry_type: 'PAYMENT_RECEIVED' },
    orderBy: { created_at: 'asc' },
  });
  console.log('\n=== PAYMENTS ===');
  for (const p of payments) {
    console.log({
      date: p.created_at.toISOString(),
      amount: Number(p.amount),
      desc: p.description,
      sale_id: p.sale_id,
      created_by: p.created_by,
      ref: p.reference_no,
    });
  }

  const revs = await prisma.customerSaleLedgerRevision.findMany({ where: { customer_id: cid } });
  console.log('\n=== REVISIONS ===', revs.length);
  console.log(JSON.stringify(revs, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
