import { getShopifyBundle } from "@/lib/data/shopify-dashboard";
import { getInventory, getFulfillmentStatus } from "@/lib/shopify/inventory";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { dateRangeCompleted } from "@/lib/utils/periods";
import type { Market, Period } from "@/types/metric";
import { RotateCcw, TrendingUp, Tag, AlertCircle, Lightbulb, ArrowDown, ArrowUp, Calendar } from "lucide-react";
import { FiltersBar } from "@/components/filters/FiltersBar";
import { DashboardActions } from "@/components/shared/DashboardActions";

export const revalidate = 300;

export default async function ShopifyPage({
  searchParams,
}: {
  searchParams: { market?: string; period?: string; from?: string; to?: string };
}) {
  const market = (searchParams.market || "US") as Market;
  const period = (searchParams.period || "28d") as Period;
  const range = searchParams.from && searchParams.to
    ? { from: searchParams.from, to: searchParams.to }
    : dateRangeCompleted(period);

  const [data, inventory, fulfillment] = await Promise.all([
    getShopifyBundle(market, range),
    getInventory(market),
    getFulfillmentStatus(market),
  ]);
  const currency = market === "US" ? "USD" : "BRL";

  return (
    <>
      <header className="hidden lg:flex px-8 py-3 items-center justify-between" style={{ background: "var(--paper)", borderBottom: "1px solid var(--border)" }}>
        <div className="text-[12px]" style={{ color: "var(--ink)", fontWeight: 500 }}>Shopify</div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <div className="pulse-dot" />
          <span>BigQuery Larroude OS - {data.source}</span>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>Shopify</h1>
            <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
              Sales, products, collections, returns, checkout funnel, automated suggestions
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>
              <Calendar className="inline w-3 h-3 mr-1" />
              {data.period.from} to {data.period.to} - via {data.source === "BQ" ? "BigQuery Larroude OS" : "Mock"}
            </p>
          </div>
          <DashboardActions />
        </div>

        <FiltersBar />

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-7">
          <KPI label="ORDERS" value={formatNumber(data.orders)} />
          <KPI label="GROSS" value={formatCurrency(data.gross_sales, currency)} />
          <KPI label="NET SALES" value={formatCurrency(data.net_sales, currency)} />
          <KPI label="AOV" value={formatCurrency(data.aov, currency, false)} />
          <KPI label="UNITS" value={formatNumber(data.units_sold)} />
          <KPI label="CHECKOUT CVR" value={data.conversion_rate_pct.toFixed(1) + "%"} tone={data.conversion_rate_pct >= 60 ? "positive" : data.conversion_rate_pct >= 45 ? "warning" : "negative"} />
          <KPI label="RETURN RATE" value={data.return_rate_pct.toFixed(1) + "%"} tone={data.return_rate_pct <= 10 ? "positive" : data.return_rate_pct <= 18 ? "warning" : "negative"} />
        </div>

        <SectionHeader title="CHECKOUT FUNNEL" />
        <div className="card mb-7">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="label-meta">STARTED CHECKOUTS</div>
              <div className="font-num text-[24px] font-bold mt-1" style={{ color: "var(--ink)" }}>
                {formatNumber(data.funnel.abandoned_checkouts + data.funnel.completed_orders)}
              </div>
            </div>
            <div>
              <div className="label-meta">ABANDONED</div>
              <div className="font-num text-[24px] font-bold mt-1" style={{ color: "var(--negative)" }}>
                {formatNumber(data.funnel.abandoned_checkouts)}
              </div>
              <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                {((data.funnel.abandoned_checkouts / Math.max(1, data.funnel.abandoned_checkouts + data.funnel.completed_orders)) * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="label-meta">COMPLETED</div>
              <div className="font-num text-[24px] font-bold mt-1" style={{ color: "var(--positive)" }}>
                {formatNumber(data.funnel.completed_orders)}
              </div>
              <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                {data.funnel.checkout_cvr_pct.toFixed(1)}% CVR
              </div>
            </div>
          </div>
          <div className="mt-4 h-3 rounded overflow-hidden flex" style={{ background: "var(--paper)" }}>
            <div className="h-full" style={{ width: data.funnel.checkout_cvr_pct + "%", background: "var(--positive)" }} />
            <div className="h-full" style={{ width: (100 - data.funnel.checkout_cvr_pct) + "%", background: "var(--negative)" }} />
          </div>
        </div>

        {data.suggestions.length > 0 && (
          <>
            <SectionHeader title="AUTOMATED SUGGESTIONS" extra={"cross-source (" + data.suggestions.length + " insights)"} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-7">
              {data.suggestions.map((s, i) => <SuggestionCard key={i} suggestion={s} />)}
            </div>
          </>
        )}

        <SectionHeader title="TOP PRODUCTS (BY REVENUE)" />
        <div className="card mb-7 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left py-2 label-meta">PRODUCT</th>
                <th className="text-right py-2 label-meta">UNITS</th>
                <th className="text-right py-2 label-meta">ORDERS</th>
                <th className="text-right py-2 label-meta">AVG PRICE</th>
                <th className="text-right py-2 label-meta">REVENUE</th>
              </tr>
            </thead>
            <tbody>
              {data.top_products.map((p, i) => (
                <tr key={i} style={{ borderBottom: i < data.top_products.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--pink-soft)", color: "var(--pink-deep)" }}>{i + 1}</div>
                      <div>
                        <div className="font-semibold" style={{ color: "var(--ink)" }}>{p.name}</div>
                        <div className="text-[10px]" style={{ color: "var(--ink-muted)" }}>{p.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-right font-num" style={{ color: "var(--ink)" }}>{formatNumber(p.units)}</td>
                  <td className="py-2.5 text-right font-num" style={{ color: "var(--ink-soft)" }}>{formatNumber(p.orders)}</td>
                  <td className="py-2.5 text-right font-num" style={{ color: "var(--ink-soft)" }}>{formatCurrency(p.avg_price, currency, false)}</td>
                  <td className="py-2.5 text-right font-num font-bold" style={{ color: "var(--ink)" }}>{formatCurrency(p.revenue, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.top_variants.length > 0 && (
          <>
            <SectionHeader title="TOP VARIANTS (COLOR + SIZE)" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
              {data.top_variants.slice(0, 8).map((v, i) => (
                <div key={i} className="card">
                  <div className="label-meta">#{i + 1}</div>
                  <div className="text-[12px] font-semibold mt-1 line-clamp-2" style={{ color: "var(--ink)" }}>{v.title}</div>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="font-num text-[16px] font-bold" style={{ color: "var(--ink)" }}>{formatNumber(v.units)}u</span>
                    <span className="text-[11px] font-num" style={{ color: "var(--ink-muted)" }}>{formatCurrency(v.revenue, currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {data.collections.length > 0 && (
          <>
            <SectionHeader title="COLLECTION PERFORMANCE" />
            <div className="card mb-7">
              {data.collections.map((c, i) => {
                const maxRev = Math.max(...data.collections.map((x) => x.revenue));
                const pct = (c.revenue / Math.max(1, maxRev)) * 100;
                return (
                  <div key={i} className="flex items-center gap-3 mb-2 last:mb-0">
                    <div className="w-32 text-[12px] truncate" style={{ color: "var(--ink-soft)" }}>{c.collection}</div>
                    <div className="flex-1 h-6 rounded relative" style={{ background: "var(--paper)" }}>
                      <div className="h-full rounded flex items-center justify-end px-2" style={{ width: pct + "%", background: i === 0 ? "var(--pink-soft)" : "var(--paper-deep)" }}>
                        <span className="text-[10px] font-num font-semibold" style={{ color: "var(--ink)" }}>{formatNumber(c.units)}u</span>
                      </div>
                    </div>
                    <div className="w-24 text-right text-[11px] font-num" style={{ color: "var(--ink)" }}>{formatCurrency(c.revenue, currency)}</div>
                    <div className="w-16 text-right text-[10px] font-num" style={{ color: "var(--ink-muted)" }}>{formatNumber(c.orders)} ord</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <SectionHeader title="RETURNS" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-7">
          <div className="card">
            <div className="label-meta mb-2">TOTAL REFUNDED</div>
            <div className="font-num font-bold text-[22px]" style={{ color: "var(--negative)" }}>{formatCurrency(data.returns.total_refund_value, currency)}</div>
            <div className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>{formatNumber(data.returns.refund_orders)} refunded orders</div>
          </div>
          <div className="card">
            <div className="label-meta mb-2">RETURN RATE</div>
            <div className="font-num font-bold text-[22px]" style={{ color: data.returns.return_rate_pct > 18 ? "var(--negative)" : data.returns.return_rate_pct > 10 ? "var(--warning)" : "var(--positive)" }}>{data.returns.return_rate_pct.toFixed(1)}%</div>
            <div className="text-[11px] mt-1" style={{ color: "var(--ink-muted)" }}>vs orders in period</div>
          </div>
          <div className="card">
            <div className="label-meta mb-2">TOP RETURNED</div>
            {data.returns.top_returned.slice(0, 4).map((r, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-[12px]" style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none" }}>
                <span style={{ color: "var(--ink)" }}>{r.sku}</span>
                <span className="font-num" style={{ color: "var(--negative)" }}>{formatCurrency(r.refund_value, currency)}</span>
              </div>
            ))}
          </div>
        </div>

        <SectionHeader title="SALES BY WEEKDAY" />
        <div className="card mb-7 overflow-x-auto">
          <div className="grid grid-cols-7 gap-2 min-w-[480px]">
            {(() => {
              const maxOrders = Math.max(...data.weekday_perf.map((d) => d.orders));
              const bestIdx = data.weekday_perf.indexOf(data.weekday_perf.reduce((a, b) => a.orders > b.orders ? a : b));
              return data.weekday_perf.map((d, i) => (
                <div key={i} className="text-center">
                  <div className="label-meta mb-2">{d.weekday}</div>
                  <div className="rounded-lg flex flex-col justify-end items-center" style={{ height: 80, background: "var(--paper)" }}>
                    <div className="w-full rounded-lg" style={{ height: ((d.orders / Math.max(1, maxOrders)) * 100) + "%", background: i === bestIdx ? "var(--pink)" : "var(--paper-deep)", minHeight: 4 }} />
                  </div>
                  <div className="font-num text-[12px] mt-2 font-semibold" style={{ color: "var(--ink)" }}>{formatNumber(d.orders)}</div>
                  <div className="text-[10px] font-num" style={{ color: "var(--ink-muted)" }}>{formatCurrency(d.revenue, currency)}</div>
                </div>
              ));
            })()}
          </div>
        </div>

        <SectionHeader title={"INVENTORY (SHOPIFY ADMIN API)"} extra={inventory.source === "Shopify" ? "live - " + inventory.total_variants_sampled + " variants sampled" : "mock - " + inventory.total_variants_sampled + " variants"} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <div className="card">
            <div className="label-meta mb-1">UNITS IN STOCK</div>
            <div className="font-num font-bold text-[22px]" style={{ color: "var(--ink)" }}>{formatNumber(inventory.total_units_in_stock)}</div>
            <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{inventory.total_variants_sampled} SKUs</div>
          </div>
          <div className="card">
            <div className="label-meta mb-1">LOW STOCK</div>
            <div className="font-num font-bold text-[22px]" style={{ color: inventory.low_stock_count > 30 ? "var(--warning)" : "var(--ink)" }}>{formatNumber(inventory.low_stock_count)}</div>
            <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>SKUs with under 20u</div>
          </div>
          <div className="card">
            <div className="label-meta mb-1">OUT OF STOCK</div>
            <div className="font-num font-bold text-[22px]" style={{ color: inventory.out_of_stock_count > 10 ? "var(--negative)" : "var(--ink)" }}>{formatNumber(inventory.out_of_stock_count)}</div>
            <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>zeroed SKUs</div>
          </div>
        </div>
        {inventory.low_stock_items.length > 0 && (
          <div className="card mb-3">
            <h4 className="text-[12px] font-semibold mb-3" style={{ color: "var(--ink)" }}>Top variants with low stock</h4>
            <div className="space-y-2">
              {inventory.low_stock_items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-[12px]" style={{ borderTop: i > 0 ? "1px solid var(--border-soft)" : "none", paddingTop: i > 0 ? 8 : 0 }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-num font-bold text-[12px]" style={{ background: item.available <= 5 ? "var(--negative-soft)" : "var(--warning-soft)", color: item.available <= 5 ? "var(--negative)" : "var(--warning)" }}>{item.available}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate" style={{ color: "var(--ink)" }}>{item.product}</div>
                    <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{item.variant} - {item.sku || "no SKU"}</div>
                  </div>
                  <div className="font-num text-[11px]" style={{ color: "var(--ink-muted)" }}>{formatCurrency(item.price, currency, false)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {inventory.out_of_stock_items.length > 0 && (
          <div className="card mb-7">
            <h4 className="text-[12px] font-semibold mb-3" style={{ color: "var(--negative)" }}>Out of stock SKUs ({inventory.out_of_stock_count})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {inventory.out_of_stock_items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <span className="w-2 h-2 rounded-full" style={{ background: "var(--negative)" }} />
                  <span style={{ color: "var(--ink)" }}>{item.product}</span>
                  <span style={{ color: "var(--ink-muted)" }}>- {item.variant}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <SectionHeader title="PENDING & LATE ORDERS" extra={fulfillment.source === "Shopify" ? "live - top 100 open orders" : "mock - top 100 open orders"} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="card">
            <div className="label-meta mb-1">PENDING FULFILLMENT</div>
            <div className="font-num font-bold text-[22px]" style={{ color: "var(--ink)" }}>{formatNumber(fulfillment.pending_count)}</div>
            <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>paid orders not yet shipped</div>
          </div>
          <div className="card">
            <div className="label-meta mb-1">LATE (5+ DAYS)</div>
            <div className="font-num font-bold text-[22px]" style={{ color: fulfillment.late_count > 20 ? "var(--negative)" : fulfillment.late_count > 5 ? "var(--warning)" : "var(--ink)" }}>{formatNumber(fulfillment.late_count)}</div>
            <div className="text-[11px]" style={{ color: "var(--ink-muted)" }}>requires immediate action</div>
          </div>
        </div>
        {fulfillment.unfulfilled_orders.length > 0 && (
          <div className="card mb-7 overflow-x-auto">
            <h4 className="text-[12px] font-semibold mb-3" style={{ color: "var(--ink)" }}>Oldest unfulfilled orders</h4>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left py-2 label-meta">ORDER</th>
                  <th className="text-left py-2 label-meta">CUSTOMER</th>
                  <th className="text-left py-2 label-meta">DATE</th>
                  <th className="text-right py-2 label-meta">DAYS</th>
                  <th className="text-right py-2 label-meta">ITEMS</th>
                  <th className="text-right py-2 label-meta">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {fulfillment.unfulfilled_orders.map((o, i) => (
                  <tr key={i} style={{ borderBottom: i < fulfillment.unfulfilled_orders.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                    <td className="py-2 font-semibold" style={{ color: "var(--ink)" }}>{o.order_name}</td>
                    <td className="py-2" style={{ color: "var(--ink-soft)" }}>{o.customer}</td>
                    <td className="py-2 font-num" style={{ color: "var(--ink-muted)" }}>{o.created_at}</td>
                    <td className="py-2 text-right font-num font-bold" style={{ color: o.days_open >= 7 ? "var(--negative)" : "var(--warning)" }}>{o.days_open}d</td>
                    <td className="py-2 text-right font-num" style={{ color: "var(--ink-muted)" }}>{o.items_count}</td>
                    <td className="py-2 text-right font-num" style={{ color: "var(--ink)" }}>{formatCurrency(o.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "positive" | "warning" | "negative" }) {
  const color = tone === "positive" ? "var(--positive)" : tone === "warning" ? "var(--warning)" : tone === "negative" ? "var(--negative)" : "var(--ink)";
  return (
    <div className="card">
      <div className="label-meta mb-2">{label}</div>
      <div className="font-num font-bold text-[16px] lg:text-[18px]" style={{ color }}>{value}</div>
    </div>
  );
}

function SectionHeader({ title, extra }: { title: string; extra?: string }) {
  return (
    <div className="section-marker mb-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)", letterSpacing: "0.06em" }}>{title}</span>
        {extra && <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{extra}</span>}
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Awaited<ReturnType<typeof getShopifyBundle>>["suggestions"][number] }) {
  const iconMap: Record<string, React.ReactNode> = {
    "high-cvr": <TrendingUp className="w-4 h-4" />,
    "trending": <ArrowUp className="w-4 h-4" />,
    "high-aov": <Tag className="w-4 h-4" />,
    "low-stock": <AlertCircle className="w-4 h-4" />,
    "discount-heavy": <ArrowDown className="w-4 h-4" />,
    "underperforming": <RotateCcw className="w-4 h-4" />,
  };
  const cMap = { high: "var(--negative)", medium: "var(--warning)", low: "var(--positive)" };
  const bMap = { high: "var(--negative-soft)", medium: "var(--warning-soft)", low: "var(--positive-soft)" };

  return (
    <div className="card" style={{ borderLeft: "3px solid " + cMap[suggestion.priority] }}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bMap[suggestion.priority], color: cMap[suggestion.priority] }}>
          {iconMap[suggestion.type] ?? <Lightbulb className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="badge" style={{ background: bMap[suggestion.priority], color: cMap[suggestion.priority], fontSize: 9 }}>{suggestion.priority.toUpperCase()}</span>
            <span className="label-meta" style={{ fontSize: 9 }}>{suggestion.type.toUpperCase().replace("-", " ")}</span>
          </div>
          <h4 className="text-[13px] font-semibold mb-1" style={{ color: "var(--ink)" }}>{suggestion.title}</h4>
          <p className="text-[11px] mb-2" style={{ color: "var(--ink-soft)" }}>{suggestion.detail}</p>
          <div className="text-[10px] font-num" style={{ color: cMap[suggestion.priority] }}>{suggestion.metric}</div>
        </div>
      </div>
    </div>
  );
}
