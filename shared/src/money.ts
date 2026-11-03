/**
 * Money is stored as integer paise (₹1 = 100 paise) everywhere in the system,
 * so totals never suffer from floating-point rounding (0.1 + 0.2 problems).
 * It is only converted to rupees for display.
 */

// Whole rupees show no decimals ("₹480"); anything else always shows two ("₹120.50", never "₹120.5").
const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const rupeesAndPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 48000 -> "₹480", 12050 -> "₹120.50", 12000000 -> "₹1,20,000" (Indian grouping). */
export function formatRupees(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`Money must be whole paise, got ${paise}`);
  }
  const formatter = paise % 100 === 0 ? wholeRupees : rupeesAndPaise;
  return formatter.format(paise / 100);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function lineTotalPaise(unitPricePaise: number, quantity: number): number {
  return unitPricePaise * quantity;
}
