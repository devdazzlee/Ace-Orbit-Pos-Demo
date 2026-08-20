import { Prisma } from '@prisma/client';

/**
 * Invoice-level discount allocation.
 *
 * The POS records a discount once, on the sale header (`Sale.discount_amount`);
 * sale lines always keep the gross catalogue price in `unit_price`. That means
 * `unit_price` is NOT what the customer paid — on a 280 sale with a 10 discount
 * the customer handed over 270, so a full return owes them 270, not 280.
 *
 * To refund exactly what was collected, the header discount is spread across the
 * original lines in proportion to their value, giving every line the price the
 * customer effectively paid per unit. Returns, exchanges and any UI that quotes a
 * refund must price off that net figure.
 */

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export interface DiscountAllocatableLine {
  id: string;
  quantity: DecimalLike;
  unit_price: DecimalLike;
  line_total?: DecimalLike;
}

export interface AllocatedLinePricing {
  /** Gross value of the line before the invoice discount. */
  grossLineTotal: Prisma.Decimal;
  /** Share of the invoice discount carried by this line (2dp, sums to the header discount). */
  discountShare: Prisma.Decimal;
  /** What the customer actually paid for this line (2dp). */
  netLineTotal: Prisma.Decimal;
  /** Price actually paid per unit — full precision, so partial returns stay exact. */
  netUnitPrice: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);
const CENT = new Prisma.Decimal('0.01');

const toDecimal = (value: DecimalLike): Prisma.Decimal =>
  value === null || value === undefined ? ZERO : new Prisma.Decimal(value);

const grossOf = (line: DiscountAllocatableLine): Prisma.Decimal => {
  const explicit = line.line_total;
  if (explicit !== null && explicit !== undefined) return toDecimal(explicit);
  return toDecimal(line.unit_price).mul(toDecimal(line.quantity));
};

/**
 * Spreads `invoiceDiscount` over `lines` proportionally to line value.
 *
 * Cents are allocated with the largest-remainder method, so the shares always add
 * up to the header discount exactly — a full return of every line refunds the
 * invoice total to the cent, with no rounding drift.
 */
export function allocateInvoiceDiscount(
  lines: DiscountAllocatableLine[],
  invoiceDiscount: DecimalLike,
): Map<string, AllocatedLinePricing> {
  const result = new Map<string, AllocatedLinePricing>();
  if (lines.length === 0) return result;

  const grossByLine = lines.map((line) => ({ line, gross: grossOf(line) }));
  const grossTotal = grossByLine.reduce((sum, entry) => sum.plus(entry.gross), ZERO);

  // Never give back more than was charged, and never less than nothing.
  const discount = Prisma.Decimal.max(
    ZERO,
    Prisma.Decimal.min(toDecimal(invoiceDiscount), grossTotal),
  );

  const shares = new Map<string, Prisma.Decimal>();

  if (discount.isZero() || grossTotal.lte(0)) {
    for (const { line } of grossByLine) shares.set(line.id, ZERO);
  } else {
    // Floor every share to whole cents first, then hand the leftover cents to the
    // lines with the biggest truncated remainder.
    const remainders: Array<{ id: string; remainder: Prisma.Decimal }> = [];
    let allocated = ZERO;

    for (const { line, gross } of grossByLine) {
      const exact = discount.mul(gross).div(grossTotal);
      const floored = exact.div(CENT).floor().mul(CENT);
      shares.set(line.id, floored);
      allocated = allocated.plus(floored);
      remainders.push({ id: line.id, remainder: exact.minus(floored) });
    }

    let leftoverCents = discount.minus(allocated).div(CENT).round().toNumber();
    remainders.sort((a, b) => b.remainder.comparedTo(a.remainder));
    for (let i = 0; leftoverCents > 0 && i < remainders.length; i += 1, leftoverCents -= 1) {
      const id = remainders[i].id;
      shares.set(id, (shares.get(id) ?? ZERO).plus(CENT));
    }
  }

  for (const { line, gross } of grossByLine) {
    const discountShare = shares.get(line.id) ?? ZERO;
    const netLineTotal = gross.minus(discountShare);
    const quantity = toDecimal(line.quantity);
    const netUnitPrice = quantity.isZero()
      ? toDecimal(line.unit_price)
      : netLineTotal.div(quantity);

    result.set(line.id, { grossLineTotal: gross, discountShare, netLineTotal, netUnitPrice });
  }

  return result;
}

/** Rounds a money amount to 2dp, the precision every stored total uses. */
export const roundMoney = (value: Prisma.Decimal): Prisma.Decimal =>
  new Prisma.Decimal(value.toFixed(2));
