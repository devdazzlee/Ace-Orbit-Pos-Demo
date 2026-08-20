import { allocateInvoiceDiscount, roundMoney } from '../src/utils/sale-pricing';

const show = (label: string, lines: any[], discount: number) => {
  const map = allocateInvoiceDiscount(lines, discount);
  const rows = lines.map((l) => {
    const p = map.get(l.id)!;
    return `${l.id}: gross=${p.grossLineTotal} share=${p.discountShare} net=${p.netLineTotal} netUnit=${p.netUnitPrice.toFixed(6)}`;
  });
  const netSum = lines.reduce((s, l) => s + map.get(l.id)!.netLineTotal.toNumber(), 0);
  const shareSum = lines.reduce((s, l) => s + map.get(l.id)!.discountShare.toNumber(), 0);
  console.log(`\n${label}\n  ${rows.join('\n  ')}\n  netSum=${netSum} shareSum=${shareSum}`);
};

// The reported bug: one line of 280, invoice discount 10 → refund must be 270.
show('single line 280 - 10', [{ id: 'a', quantity: 1, unit_price: 280, line_total: 280 }], 10);

// Multi-line, discount splits proportionally and adds back to the invoice total.
show('multi line', [
  { id: 'a', quantity: 2, unit_price: 100, line_total: 200 },
  { id: 'b', quantity: 1, unit_price: 50, line_total: 50 },
  { id: 'c', quantity: 3, unit_price: 10, line_total: 30 },
], 37);

// Nasty thirds: cents must still reconcile exactly.
show('thirds', [
  { id: 'a', quantity: 1, unit_price: 10, line_total: 10 },
  { id: 'b', quantity: 1, unit_price: 10, line_total: 10 },
  { id: 'c', quantity: 1, unit_price: 10, line_total: 10 },
], 10);

// No discount, and an over-sized discount (clamped to the invoice).
show('no discount', [{ id: 'a', quantity: 4, unit_price: 25, line_total: 100 }], 0);
show('discount > subtotal', [{ id: 'a', quantity: 4, unit_price: 25, line_total: 100 }], 500);

// Partial return of a discounted line: 3 units of 100 with 30 off → 90 per unit.
const partial = allocateInvoiceDiscount([{ id: 'a', quantity: 3, unit_price: 100, line_total: 300 }], 30);
console.log('\npartial return of 1 unit refunds', roundMoney(partial.get('a')!.netUnitPrice.mul(1)).toString());
