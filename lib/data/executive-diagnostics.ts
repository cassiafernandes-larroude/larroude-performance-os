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

// Marcos de negócio que afetam interpretação de variações.
// Cassia 2026-06-13: "o negócio no Brasil nasceu no ano passado".
// Confirmado via BQ: BR começou nov/2024 com R$21k de spend; maturou ~jul/2025 (R$148k).
const BR_LAUNCH_DATE = "2024-11-01";       // primeiro mês com spend BR
const BR_MATURITY_DATE = "2025-07-01";    // mês em que spend BR triplicou (operação madura)

function rangeIncludesBrLaunch(from: string, to: string): "before-launch" | "scaling" | "mature" | "mixed" {
  if (to < BR_LAUNCH_DATE) return "before-launch";
  if (from >= BR_MATURITY_DATE) return "mature";
  if (from >= BR_LAUNCH_DATE && to < BR_MATURITY_DATE) return "scaling";
  return "mixed"; // atravessa o launch ou a maturação
}

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

  // --- 10) Spend ↔ Sales daily correlation (Pearson) ----------------------
  if (spendSeries.length >= 7 && salesSeries.length === spendSeries.length) {
    const ms = avg(spendSeries);
    const mr = avg(salesSeries);
    let num = 0, denS = 0, denR = 0;
    for (let i = 0; i < spendSeries.length; i++) {
      const ds = spendSeries[i] - ms;
      const dr = salesSeries[i] - mr;
      num += ds * dr;
      denS += ds * ds;
      denR += dr * dr;
    }
    const r = denS > 0 && denR > 0 ? num / Math.sqrt(denS * denR) : 0;
    if (Math.abs(r) >= 0.3) {
      const strength =
        Math.abs(r) >= 0.75 ? "strong" : Math.abs(r) >= 0.5 ? "moderate" : "weak";
      const direction = r > 0 ? "positive" : "negative";
      out.push({
        id: "spend-sales-correlation",
        severity: r > 0.5 ? "positive" : "info",
        cause: `Daily spend ↔ daily sales correlation = ${r.toFixed(2)} (${strength} ${direction})`,
        effect:
          r > 0.5
            ? "When spend goes up, sales follow on the same day. Spend is acting as a direct revenue lever."
            : r > 0
            ? "Sales partially follow spend but other factors (organic, owned, seasonality) drive most of the variance."
            : "Sales tend to move opposite to spend — investment is not driving same-day demand. Likely organic/seasonal noise dominates.",
        evidence: [
          `Pearson r: ${r.toFixed(3)} (n=${spendSeries.length} days)`,
          `Spend avg: ${fmtMoney(ms)} · Sales avg: ${fmtMoney(mr)}`,
          `Interpretation: r²=${(r * r).toFixed(2)} → ${Math.round(r * r * 100)}% of daily sales variance explained by spend`,
        ],
        recommendation:
          Math.abs(r) >= 0.5
            ? "Lever is live: budget changes should produce predictable revenue swings within the day."
            : "Don't expect immediate revenue lift from spend pushes — track 2-3 day lag and consider attribution drift.",
      });
    }
  }

  // --- 11) Lag-1 correlation: spend yesterday → sales today ---------------
  if (spendSeries.length >= 8 && salesSeries.length === spendSeries.length) {
    const sp = spendSeries.slice(0, -1); // spend on day d
    const sa = salesSeries.slice(1);     // sales on day d+1
    const ms = avg(sp);
    const mr = avg(sa);
    let num = 0, denS = 0, denR = 0;
    for (let i = 0; i < sp.length; i++) {
      const ds = sp[i] - ms;
      const dr = sa[i] - mr;
      num += ds * dr;
      denS += ds * ds;
      denR += dr * dr;
    }
    const rLag = denS > 0 && denR > 0 ? num / Math.sqrt(denS * denR) : 0;
    if (Math.abs(rLag) >= 0.35) {
      out.push({
        id: "lag-correlation",
        severity: "info",
        cause: `Spend (day D) ↔ Sales (day D+1) correlation = ${rLag.toFixed(2)} — there's a 1-day lag effect`,
        effect:
          rLag > 0
            ? "Today's investment shows up in tomorrow's sales. Plan campaign pushes the day before promo dates."
            : "Counter-intuitive negative lag — likely seasonality (e.g., week-end vs week-start cycles).",
        evidence: [
          `Lag-1 Pearson r: ${rLag.toFixed(3)}`,
          `Use this to time campaign launches: spend on D-1 to lift D`,
        ],
        recommendation: "If you need a sales spike on date X, push spend on date X−1.",
      });
    }
  }

  // --- 12) Best vs Worst ROAS day — what changed ---------------------------
  const roasDaily = c.daily.roas_total
    .map((d) => ({ date: d.date, roas: d.value, spend: 0, sales: 0 }))
    .filter((d) => d.roas > 0);
  // join with spend/sales by date
  const spendMap = new Map(c.daily.spend.map((d) => [d.date, d.value]));
  const salesMap = new Map(c.daily.total_sales.map((d) => [d.date, d.value]));
  for (const r of roasDaily) {
    r.spend = spendMap.get(r.date) ?? 0;
    r.sales = salesMap.get(r.date) ?? 0;
  }
  if (roasDaily.length >= 5) {
    const best = roasDaily.reduce((a, b) => (b.roas > a.roas ? b : a));
    const worst = roasDaily.reduce((a, b) => (b.roas < a.roas ? b : a));
    if (best.roas / Math.max(0.001, worst.roas) >= 2) {
      const spendDelta = pctChange(worst.spend, best.spend);
      const salesDelta = pctChange(worst.sales, best.sales);
      const driver =
        Math.abs(spendDelta) > Math.abs(salesDelta) ? "spend" : "sales";
      out.push({
        id: "roas-best-vs-worst",
        severity: "info",
        cause: `Best ROAS day was ${best.date} (${best.roas.toFixed(2)}×) and worst was ${worst.date} (${worst.roas.toFixed(2)}×)`,
        effect: `The ${best.roas.toFixed(1)}× spread means ${driver} swings are dominating efficiency. Same dollar bought ${(best.roas / worst.roas).toFixed(1)}× more on the best day.`,
        evidence: [
          `Best ${best.date}: spend ${fmtMoney(best.spend)} · sales ${fmtMoney(best.sales)} → ROAS ${best.roas.toFixed(2)}×`,
          `Worst ${worst.date}: spend ${fmtMoney(worst.spend)} · sales ${fmtMoney(worst.sales)} → ROAS ${worst.roas.toFixed(2)}×`,
          `Δ spend: ${fmtPct(spendDelta)} · Δ sales: ${fmtPct(salesDelta)}`,
        ],
        recommendation:
          driver === "spend"
            ? "Pacing is the lever. Match spend levels to the high-ROAS day's pattern (intraday distribution, audiences, creatives)."
            : "Sales-driven swing. Audit what was happening on the best day — promo, organic spike, hero product launch?",
      });
    }
  }

  // --- 13) Sharpest daily spend drop and its same-day sales impact ---------
  if (spendSeries.length >= 3) {
    let worstDay = -1;
    let worstDrop = 0;
    for (let i = 1; i < spendSeries.length; i++) {
      const drop = pctChange(spendSeries[i], spendSeries[i - 1]);
      if (drop < worstDrop) {
        worstDrop = drop;
        worstDay = i;
      }
    }
    if (worstDay > 0 && worstDrop < -30) {
      const date = c.daily.spend[worstDay]?.date;
      const prevDate = c.daily.spend[worstDay - 1]?.date;
      const salesDrop = pctChange(salesSeries[worstDay], salesSeries[worstDay - 1]);
      out.push({
        id: "spend-cut-impact",
        severity: "info",
        cause: `Spend dropped ${fmtPct(worstDrop)} from ${prevDate} to ${date}`,
        effect:
          salesDrop < -5
            ? `Same-day sales fell ${fmtPct(salesDrop)} — investment cut had immediate revenue impact.`
            : salesDrop > 5
            ? `Sales actually went UP ${fmtPct(salesDrop)} despite the spend cut — suggests inefficient spend on the previous day.`
            : `Sales stayed roughly flat (${fmtPct(salesDrop)}) — spend was over-investing relative to demand.`,
        evidence: [
          `${prevDate}: spend ${fmtMoney(spendSeries[worstDay - 1])} · sales ${fmtMoney(salesSeries[worstDay - 1])}`,
          `${date}: spend ${fmtMoney(spendSeries[worstDay])} · sales ${fmtMoney(salesSeries[worstDay])}`,
          `Δ spend: ${fmtPct(worstDrop)} · Δ sales: ${fmtPct(salesDrop)}`,
        ],
        recommendation:
          salesDrop > 5
            ? "Take the hint: cuts that don't hurt sales are pure margin. Sustain the lower spend level."
            : "Watch the lag — if the cut sticks, monitor next 2-3 days for compounding effect.",
      });
    }
  }

  // --- 13b) BR launch context — when range spans pre/post launch ----------
  // Cassia 2026-06-13: "o negocio no Brasil nasceu no ano passado".
  // Spend BR foi de R$21k (nov/24) → R$148k (jul/25) → R$291k (set/25).
  // Atravessar essas datas distorce o "Δ spend" agregado da Consolidated View.
  const brContext = rangeIncludesBrLaunch(c.period.from, c.period.to);
  if (brContext === "mixed" || brContext === "scaling") {
    const brShare = safeDiv(c.by_market.BR.spend, c.total_ad_spend) * 100;
    out.push({
      id: "br-launch-context",
      severity: "info",
      cause:
        brContext === "mixed"
          ? `This range crosses the BR launch period (Nov/2024 to Jul/2025)`
          : `This range falls inside the BR ramp-up window (Nov/2024 to Jul/2025)`,
      effect:
        brContext === "mixed"
          ? `Consolidated growth in spend/sales reflects BR coming online from near-zero, not organic acceleration. Compare to a like-for-like (post-Jul/2025) window for cleaner signal.`
          : `BR was still scaling — month-over-month spend surges in this period are expected (the operation grew from R$21k to R$291k between Nov/2024 and Sep/2025).`,
      evidence: [
        `BR launch reference: ${BR_LAUNCH_DATE}`,
        `BR maturity reference: ${BR_MATURITY_DATE}`,
        `BR share of total spend in this window: ${brShare.toFixed(1)}%`,
        `Spend trajectory BR: Nov/24 R$21k → Jul/25 R$148k → Sep/25 R$291k`,
      ],
      recommendation:
        brContext === "mixed"
          ? "Read the surge/pacing diagnostics below with this lens — anything dated before Jul/2025 is partly the BR launch curve, not a true marginal-ROAS signal."
          : "For pacing decisions, weight US data more heavily until Jul/2025 — BR is still finding its baseline.",
    });
  }

  // --- 14) Sharpest daily spend surge and its return ----------------------
  if (spendSeries.length >= 3) {
    let bestDay = -1;
    let bestSurge = 0;
    for (let i = 1; i < spendSeries.length; i++) {
      const surge = pctChange(spendSeries[i], spendSeries[i - 1]);
      if (surge > bestSurge) {
        bestSurge = surge;
        bestDay = i;
      }
    }
    if (bestDay > 0 && bestSurge > 30) {
      const date = c.daily.spend[bestDay]?.date;
      const prevDate = c.daily.spend[bestDay - 1]?.date;
      const salesDelta = pctChange(salesSeries[bestDay], salesSeries[bestDay - 1]);
      const efficient = salesDelta >= bestSurge * 0.5;

      // Breakdown por country — Cassia 2026-06-13: "diga em qual pais"
      const byM = c.daily_by_market;
      const usSpendPrev = byM?.US.spend.find((p) => p.date === prevDate)?.value ?? 0;
      const usSpendCurr = byM?.US.spend.find((p) => p.date === date)?.value ?? 0;
      const brSpendPrev = byM?.BR.spend.find((p) => p.date === prevDate)?.value ?? 0;
      const brSpendCurr = byM?.BR.spend.find((p) => p.date === date)?.value ?? 0;
      const usDelta = pctChange(usSpendCurr, usSpendPrev);
      const brDelta = pctChange(brSpendCurr, brSpendPrev);
      const usAbsDelta = usSpendCurr - usSpendPrev;
      const brAbsDelta = brSpendCurr - brSpendPrev;
      const driver = Math.abs(brAbsDelta) > Math.abs(usAbsDelta) ? "BR" : "US";
      const driverPct = driver === "BR"
        ? safeDiv(brAbsDelta, (usAbsDelta + brAbsDelta)) * 100
        : safeDiv(usAbsDelta, (usAbsDelta + brAbsDelta)) * 100;

      const evidence = [
        `${prevDate}: spend ${fmtMoney(spendSeries[bestDay - 1])} · sales ${fmtMoney(salesSeries[bestDay - 1])}`,
        `${date}: spend ${fmtMoney(spendSeries[bestDay])} · sales ${fmtMoney(salesSeries[bestDay])}`,
        `Δ spend: ${fmtPct(bestSurge)} · Δ sales: ${fmtPct(salesDelta)}`,
      ];
      if (byM) {
        evidence.push(`Breakdown: US ${fmtMoney(usSpendPrev)} → ${fmtMoney(usSpendCurr)} (${fmtPct(usDelta)}) · BR ${fmtMoney(brSpendPrev)} → ${fmtMoney(brSpendCurr)} (${fmtPct(brDelta)})`);
        evidence.push(`Driver: ${driver} responded for ${driverPct.toFixed(0)}% of the surge (${fmtMoney(driver === "BR" ? brAbsDelta : usAbsDelta)} of ${fmtMoney(usAbsDelta + brAbsDelta)})`);
      }

      // Contexto BR ramp-up: BR esta escalando desde Nov/2024 (R$21k → R$291k em Set/25).
      const brIsScaling = brContext !== "mature";
      const brExplain = driver === "BR" && brAbsDelta > 0 && brIsScaling;

      let recommendation = efficient
        ? "Replicate the pattern — what was different that day (creative, audience, promo)?"
        : "Avoid blanket budget surges. The marginal return is below 50% of the marginal spend.";

      if (brExplain) {
        recommendation =
          `BR accounted for ${driverPct.toFixed(0)}% of this surge — and the BR operation is still scaling gradually since launch (Nov/2024: R$21k → Sep/2025: R$291k). ` +
          `Part of this jump is the planned ramp-up, NOT inefficiency. ` +
          `Before pausing budget: 1) confirm BR weekly trajectory matches the scale plan; 2) compute BR-only ROAS for ${date} (BR sales ${fmtMoney(byM?.BR.total_sales.find((p) => p.date === date)?.value ?? 0)} / BR spend ${fmtMoney(brSpendCurr)}); 3) only flag as inefficient if BR-only ROAS dropped vs the previous BR baseline.`;
      }

      out.push({
        id: "spend-push-impact",
        severity: efficient ? "positive" : (brExplain ? "info" : "warning"),
        cause: `Spend surged ${fmtPct(bestSurge)} from ${prevDate} to ${date}${byM ? ` (driver: ${driver} ${fmtPct(driver === "BR" ? brDelta : usDelta)})` : ""}`,
        effect: efficient
          ? `Sales responded with +${fmtPct(salesDelta)} — the push paid off (efficiency ratio ${(salesDelta / bestSurge).toFixed(2)}).${brExplain ? ` Note: BR drove ${driverPct.toFixed(0)}% of the surge — partially explained by the gradual BR ramp-up since Nov/2024.` : ""}`
          : `Sales only moved ${fmtPct(salesDelta)} — the surge was inefficient (efficiency ratio ${(salesDelta / bestSurge).toFixed(2)}).${brExplain ? ` BUT: BR drove ${driverPct.toFixed(0)}% of the surge, and BR is in planned ramp-up since Nov/2024 — this may be expected scaling, not waste.` : ""}`,
        evidence,
        recommendation,
      });
    }
  }

  // --- 14b) ROAS drop root cause — was it spend up or sales down? ----------
  // Cassia 2026-06-13: "veja se a queda de ROAS é resultado de aumento ou
  // redução de investimento no período anterior"
  if (roasDaily.length >= 5) {
    // Detecta sequência: ROAS atual vs ROAS dos últimos 3-7 dias anteriores
    const recent = roasDaily.slice(-3);
    const baseline = roasDaily.slice(-Math.min(10, roasDaily.length), -3);
    if (recent.length >= 2 && baseline.length >= 2) {
      const recentRoas = avg(recent.map((d) => d.roas));
      const baselineRoas = avg(baseline.map((d) => d.roas));
      const roasDrop = pctChange(recentRoas, baselineRoas);
      if (roasDrop < -10) {
        // Olha o que mudou: spend up ou sales down?
        const recentSpend = avg(recent.map((d) => d.spend));
        const baselineSpend = avg(baseline.map((d) => d.spend));
        const recentSales = avg(recent.map((d) => d.sales));
        const baselineSales = avg(baseline.map((d) => d.sales));
        const spendDelta = pctChange(recentSpend, baselineSpend);
        const salesDelta = pctChange(recentSales, baselineSales);

        let rootCause = "";
        let recoText = "";
        if (spendDelta > 5 && salesDelta < spendDelta) {
          rootCause = `spend UP (${fmtPct(spendDelta)}) faster than sales (${fmtPct(salesDelta)})`;
          recoText = "Spend increase is not paying off. Audit the channels that grew most and re-test creatives/audiences before keeping the higher budget.";
        } else if (spendDelta < -5 && salesDelta < spendDelta) {
          rootCause = `spend DOWN (${fmtPct(spendDelta)}) but sales fell even faster (${fmtPct(salesDelta)})`;
          recoText = "Cutting spend is hurting sales more than expected. The previous budget level was actually productive — consider partial reinstatement.";
        } else if (salesDelta < -5 && Math.abs(spendDelta) < 5) {
          rootCause = `sales DOWN (${fmtPct(salesDelta)}) while spend stayed flat (${fmtPct(spendDelta)})`;
          recoText = "Demand softened independently from ad spend. Check seasonality, organic traffic, site issues or competition.";
        } else if (spendDelta > 5 && salesDelta > 0) {
          rootCause = `spend UP (${fmtPct(spendDelta)}) and sales also up (${fmtPct(salesDelta)}) but not proportionally`;
          recoText = "Diminishing returns kicking in. Marginal ROAS is below average — expect plateau if budget keeps climbing.";
        } else {
          rootCause = `spend ${fmtPct(spendDelta)} · sales ${fmtPct(salesDelta)}`;
          recoText = "Mixed signal — check Channel Share to isolate which channel/market is dragging.";
        }

        // Breakdown por market
        const byM = c.daily_by_market;
        const extraEvidence: string[] = [];
        if (byM) {
          const usSpendRecent = avg(byM.US.spend.slice(-3).map((p) => p.value));
          const usSpendBase = avg(byM.US.spend.slice(-Math.min(10, byM.US.spend.length), -3).map((p) => p.value));
          const brSpendRecent = avg(byM.BR.spend.slice(-3).map((p) => p.value));
          const brSpendBase = avg(byM.BR.spend.slice(-Math.min(10, byM.BR.spend.length), -3).map((p) => p.value));
          extraEvidence.push(`US spend: ${fmtMoney(usSpendBase)} → ${fmtMoney(usSpendRecent)} (${fmtPct(pctChange(usSpendRecent, usSpendBase))})`);
          extraEvidence.push(`BR spend: ${fmtMoney(brSpendBase)} → ${fmtMoney(brSpendRecent)} (${fmtPct(pctChange(brSpendRecent, brSpendBase))})`);
        }

        out.push({
          id: "roas-drop-root-cause",
          severity: roasDrop < -25 ? "critical" : "warning",
          cause: `ROAS dropped ${fmtPct(roasDrop)} in the last 3 days vs prior baseline — root cause: ${rootCause}`,
          effect: `Recent ROAS ${recentRoas.toFixed(2)}× vs baseline ${baselineRoas.toFixed(2)}×. The ${spendDelta > 0 ? "additional" : "remaining"} dollars are converting at a lower rate.`,
          evidence: [
            `Recent (last 3d): ROAS ${recentRoas.toFixed(2)}× · spend avg ${fmtMoney(recentSpend)} · sales avg ${fmtMoney(recentSales)}`,
            `Baseline (prior ${baseline.length}d): ROAS ${baselineRoas.toFixed(2)}× · spend avg ${fmtMoney(baselineSpend)} · sales avg ${fmtMoney(baselineSales)}`,
            `Δ spend: ${fmtPct(spendDelta)} · Δ sales: ${fmtPct(salesDelta)} · Δ ROAS: ${fmtPct(roasDrop)}`,
            ...extraEvidence,
          ],
          recommendation: recoText,
        });
      }
    }
  }

  // --- 15) ROAS sensitivity to spend ---------------------------------------
  // Beta from linear regression: Δsales / Δspend
  if (spendSeries.length >= 5) {
    const ms = avg(spendSeries);
    const mr = avg(salesSeries);
    let num = 0, den = 0;
    for (let i = 0; i < spendSeries.length; i++) {
      const ds = spendSeries[i] - ms;
      const dr = salesSeries[i] - mr;
      num += ds * dr;
      den += ds * ds;
    }
    const beta = den > 0 ? num / den : 0;
    if (beta > 0) {
      out.push({
        id: "spend-sensitivity",
        severity: beta > 3 ? "positive" : beta > 1 ? "info" : "warning",
        cause: `Marginal ROAS (β) = ${beta.toFixed(2)} — each $1 of extra spend brings about ${fmtMoney(beta)} in sales`,
        effect:
          beta > 3
            ? "Strong leverage: budgets are still in the productive zone. Room to scale."
            : beta > 1
            ? "Healthy leverage — adding budget recovers itself with margin."
            : "Spend at the saturation zone — extra dollars barely cover themselves.",
        evidence: [
          `Linear regression β across ${spendSeries.length} days`,
          `Avg ROAS: ${c.roas.toFixed(2)}× · Marginal ROAS β: ${beta.toFixed(2)}×`,
          beta < c.roas
            ? `β < avg ROAS → diminishing returns active`
            : `β ≥ avg ROAS → still scaling productively`,
        ],
        recommendation:
          beta > 2
            ? "Increase budget incrementally and re-measure β after 2 weeks."
            : "Don't push budget up; first optimize creative/audience to lift the β.",
      });
    }
  }

  // Order by severity (critical → warning → info → positive)
  const sevOrder: Record<DiagnosticSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return out;
}
