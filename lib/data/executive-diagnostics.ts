// Cause-and-effect diagnostics for Consolidated View.
// Analyzes the ExecutiveConsolidated payload and infers WHY a KPI is up/down,
// pointing to specific drivers (channel mix, market imbalance, spend pacing, etc).
//
// Cassia 2026-06-13: "em Consolidated View inclua diagnósticos de causa e efeito"

import type { ExecutiveConsolidated } from "./executive";

export type DiagnosticSeverity = "positive" | "info" | "warning" | "critical";

export type Diagnostic = {
  id: string;
  severity: DiagnosticSeverity;
  cause: string;          // the observed cause/driver
  effect: string;         // what it does to the business
  evidence: string[];     // numbers backing the diagnosis
  recommendation?: string;
};

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function computeExecutiveDiagnostics(c: ExecutiveConsolidated): Diagnostic[] {
  const out: Diagnostic[] = [];

  // --- 1) ROAS health -----------------------------------------------------
  if (c.roas < 1.5) {
    out.push({
      id: "roas-critical",
      severity: "critical",
      cause: `ROAS at ${c.roas.toFixed(2)}× — below the 1.5× critical threshold`,
      effect: `Each $1 invested returns only ${fmtMoney(c.roas)}. Profit is negative or near zero.`,
      evidence: [
        `Total Sales: ${fmtMoney(c.total_revenue)}`,
        `Total Spend: ${fmtMoney(c.total_ad_spend)}`,
        `Profit: ${fmtMoney(c.profit)} (${c.profit_margin_pct.toFixed(1)}% margin)`,
      ],
      recommendation: "Pause underperforming campaigns or reduce spend on low-ROAS channels until the curve recovers.",
    });
  } else if (c.roas >= 3) {
    out.push({
      id: "roas-healthy",
      severity: "positive",
      cause: `ROAS at ${c.roas.toFixed(2)}× — above the 3× healthy threshold`,
      effect: `Each $1 invested generates ${fmtMoney(c.roas)} in sales. Room to scale spend.`,
      evidence: [
        `Total Sales: ${fmtMoney(c.total_revenue)}`,
        `Total Spend: ${fmtMoney(c.total_ad_spend)}`,
        `Margin: ${c.profit_margin_pct.toFixed(1)}%`,
      ],
      recommendation: "Consider increasing budget on the top-performing channels (see Channel Share below).",
    });
  }

  // --- 2) Spend pacing — first half vs second half of the window ----------
  const spendSeries = c.daily.spend.map((d) => d.value);
  const salesSeries = c.daily.total_sales.map((d) => d.value);
  if (spendSeries.length >= 4) {
    const mid = Math.floor(spendSeries.length / 2);
    const spendFirst = avg(spendSeries.slice(0, mid));
    const spendSecond = avg(spendSeries.slice(mid));
    const salesFirst = avg(salesSeries.slice(0, mid));
    const salesSecond = avg(salesSeries.slice(mid));
    const spendDelta = pctChange(spendSecond, spendFirst);
    const salesDelta = pctChange(salesSecond, salesFirst);
    const efficiency = spendDelta - salesDelta;

    if (Math.abs(efficiency) >= 10) {
      const decelerating = efficiency > 0; // spend grew faster than sales
      out.push({
        id: "pacing-divergence",
        severity: decelerating ? "warning" : "positive",
        cause: decelerating
          ? `Spend grew ${fmtPct(spendDelta)} but sales only ${fmtPct(salesDelta)} (second half vs first half)`
          : `Sales accelerated faster than spend (${fmtPct(salesDelta)} vs ${fmtPct(spendDelta)})`,
        effect: decelerating
          ? "Marginal ROAS is decreasing — extra dollars are buying less revenue."
          : "Marginal ROAS is improving — the campaigns are scaling efficiently.",
        evidence: [
          `Daily avg spend: 1st half ${fmtMoney(spendFirst)} → 2nd half ${fmtMoney(spendSecond)}`,
          `Daily avg sales: 1st half ${fmtMoney(salesFirst)} → 2nd half ${fmtMoney(salesSecond)}`,
          `Efficiency gap: ${fmtPct(efficiency)}`,
        ],
        recommendation: decelerating
          ? "Pull back on the channels that grew spend but not sales. Check Channel Share for the laggard."
          : "Sustain or marginally increase spend — the curve is still bending up.",
      });
    }
  }

  // --- 3) Market imbalance — US vs BR ROAS gap ----------------------------
  const usRoas = safeDiv(c.by_market.US.revenue, c.by_market.US.spend);
  const brRoas = safeDiv(c.by_market.BR.revenue, c.by_market.BR.spend);
  if (usRoas > 0 && brRoas > 0) {
    const gapPct = Math.abs((usRoas - brRoas) / Math.min(usRoas, brRoas)) * 100;
    if (gapPct >= 40) {
      const winner = usRoas > brRoas ? "US" : "BR";
      const loser = usRoas > brRoas ? "BR" : "US";
      const winnerRoas = Math.max(usRoas, brRoas);
      const loserRoas = Math.min(usRoas, brRoas);
      out.push({
        id: "market-imbalance",
        severity: "warning",
        cause: `${winner} ROAS (${winnerRoas.toFixed(2)}×) is ${gapPct.toFixed(0)}% higher than ${loser} (${loserRoas.toFixed(2)}×)`,
        effect: `Capital is locked in the lower-ROAS market. Each $1 reallocated from ${loser} → ${winner} could yield +${fmtMoney(winnerRoas - loserRoas)} extra.`,
        evidence: [
          `US: revenue ${fmtMoney(c.by_market.US.revenue)} / spend ${fmtMoney(c.by_market.US.spend)} = ${usRoas.toFixed(2)}×`,
          `BR: revenue ${fmtMoney(c.by_market.BR.revenue)} / spend ${fmtMoney(c.by_market.BR.spend)} = ${brRoas.toFixed(2)}×`,
        ],
        recommendation: `Consider shifting incremental budget toward ${winner} unless ${loser} has saturation reasons (creative fatigue, CPM ceiling).`,
      });
    }
  }

  // --- 4) Channel concentration risk --------------------------------------
  if (c.channels.length > 0) {
    const top = c.channels[0];
    if (top.share_pct >= 50) {
      out.push({
        id: "channel-concentration",
        severity: top.share_pct >= 65 ? "warning" : "info",
        cause: `${top.channel} concentrates ${top.share_pct.toFixed(1)}% of consolidated revenue`,
        effect: `High dependence on a single channel. A 10% drop in ${top.channel} would erase ${fmtMoney(top.revenue * 0.1)} from the period.`,
        evidence: [
          `${top.channel}: ${fmtMoney(top.revenue)} / ${top.orders} orders`,
          `${c.channels.length} total channels active`,
          c.channels.length > 1 ? `2nd channel (${c.channels[1].channel}) only ${c.channels[1].share_pct.toFixed(1)}%` : "Only one channel active",
        ],
        recommendation: "Build a secondary channel to >20% share. Diversify acquisition risk.",
      });
    }
  }

  // --- 5) Meta vs Google spend imbalance ----------------------------------
  const metaShare = safeDiv(c.total_meta_spend, c.total_ad_spend) * 100;
  if (c.total_ad_spend > 0 && metaShare >= 85) {
    out.push({
      id: "meta-dependency",
      severity: "info",
      cause: `Meta accounts for ${metaShare.toFixed(0)}% of paid spend`,
      effect: `If Meta CPMs spike or accounts get restricted, the entire acquisition motor stalls.`,
      evidence: [
        `Meta: ${fmtMoney(c.total_meta_spend)} (${metaShare.toFixed(0)}%)`,
        `Google: ${fmtMoney(c.total_google_spend)} (${(100 - metaShare).toFixed(0)}%)`,
      ],
      recommendation: "Test scaling Google Ads to 20-30% of total spend as a hedge.",
    });
  }

  // --- 6) Profit margin pressure ------------------------------------------
  if (c.profit_margin_pct < 30 && c.total_revenue > 0) {
    out.push({
      id: "margin-pressure",
      severity: c.profit_margin_pct < 10 ? "critical" : "warning",
      cause: `Profit margin at ${c.profit_margin_pct.toFixed(1)}% (Revenue − Spend / Revenue)`,
      effect: `Every additional dollar in spend reduces profit nearly proportionally. Limited room for inefficient tests.`,
      evidence: [
        `Revenue: ${fmtMoney(c.total_revenue)}`,
        `Spend: ${fmtMoney(c.total_ad_spend)}`,
        `Profit: ${fmtMoney(c.profit)}`,
      ],
      recommendation: "Focus optimization on the lowest-CPO channels. Cut spend that doesn't beat the marginal threshold.",
    });
  }

  // --- 7) Daily anomalies — sales drops > 30% vs window avg ----------------
  if (salesSeries.length >= 7) {
    const salesAvg = avg(salesSeries);
    const anomalies = c.daily.total_sales
      .map((d, i) => ({ d, drop: salesAvg > 0 ? (salesAvg - d.value) / salesAvg : 0 }))
      .filter((x) => x.drop >= 0.4 && x.d.value > 0);
    if (anomalies.length > 0) {
      const worst = anomalies.sort((a, b) => b.drop - a.drop)[0];
      out.push({
        id: "daily-drop",
        severity: "warning",
        cause: `On ${worst.d.date}, sales were ${(worst.drop * 100).toFixed(0)}% below the window average`,
        effect: `Single-day shocks compound — investigate whether site outage, stock-out, or campaign pause caused it.`,
        evidence: [
          `${worst.d.date}: ${fmtMoney(worst.d.value)} (avg ${fmtMoney(salesAvg)})`,
          `${anomalies.length} day(s) flagged in window with drop ≥40%`,
        ],
        recommendation: "Cross-check Site Performance, inventory levels, and campaign delivery for that date.",
      });
    }
  }

  // --- 8) Spend volatility — pacing inconsistency --------------------------
  if (spendSeries.length >= 7) {
    const m = avg(spendSeries);
    const variance = avg(spendSeries.map((v) => Math.pow(v - m, 2)));
    const stdev = Math.sqrt(variance);
    const cv = m > 0 ? (stdev / m) * 100 : 0; // coefficient of variation
    if (cv > 40) {
      out.push({
        id: "spend-volatility",
        severity: "info",
        cause: `Spend volatility (CV) of ${cv.toFixed(0)}% — large gaps between peak and valley days`,
        effect: `Inconsistent pacing makes ROAS curve harder to read and can starve campaigns of learning data.`,
        evidence: [
          `Avg daily spend: ${fmtMoney(m)} ± ${fmtMoney(stdev)}`,
          `Spend range: ${fmtMoney(Math.min(...spendSeries))} → ${fmtMoney(Math.max(...spendSeries))}`,
        ],
        recommendation: "Smooth pacing through Meta automated rules or daily budget caps closer to the average.",
      });
    }
  }

  // --- 9) Gross vs Net delta — return pressure ----------------------------
  const returnsAbs = c.total_gross_revenue - c.total_revenue;
  const returnsRate = safeDiv(returnsAbs, c.total_gross_revenue) * 100;
  if (returnsRate > 15) {
    out.push({
      id: "high-returns",
      severity: returnsRate > 25 ? "warning" : "info",
      cause: `${returnsRate.toFixed(1)}% of gross revenue is being lost to returns/refunds`,
      effect: `Net Sales is ${fmtMoney(returnsAbs)} lower than Gross. ROAS based on Net is much lower than apparent.`,
      evidence: [
        `Gross: ${fmtMoney(c.total_gross_revenue)}`,
        `Net: ${fmtMoney(c.total_revenue)}`,
        `Returns drag: ${fmtMoney(returnsAbs)}`,
      ],
      recommendation: "Check Unit Economics for the SKUs with highest Return Rate and consider size-guide / quality fixes.",
    });
  }

  // Order by severity (critical → warning → info → positive)
  const sevOrder: Record<DiagnosticSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return out;
}
