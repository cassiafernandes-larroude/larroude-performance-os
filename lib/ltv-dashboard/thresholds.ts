/**
 * Client-safe thresholds used by product tables/charts/heatmap.
 * Lives in its own file so importing it does NOT pull in lib/queries.ts
 * (which transitively imports @google-cloud/bigquery — a Node-only package).
 */

/**
 * Anti-noise threshold for Top LTV ranking: minimum unique customers
 * a SKU must have to be eligible for the "highest LTV" table. Proportional
 * to window length so it scales naturally with longer periods.
 */
export function topLtvMinCustomers(windowDays: number): number {
  if (windowDays <= 90) return 20;       // ~3 months
  if (windowDays <= 200) return 50;      // ~6 months
  return 100;                             // 12 months
}
