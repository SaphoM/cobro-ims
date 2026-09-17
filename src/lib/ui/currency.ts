/**
 * The single source of truth for how a Rand value is displayed anywhere in
 * this app: "R2,850.00" - comma thousands separator, always two decimals,
 * no space after the symbol. Every screen that shows a price, cost, or
 * value must go through this rather than rolling its own `toFixed(2)`, so a
 * figure never renders inconsistently between two pages.
 */
export function formatCurrency(amount: number): string {
  return `R${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
