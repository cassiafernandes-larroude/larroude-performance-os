// Generic Cause & Effect engine that any dashboard can plug into.
// Cassia 2026-06-13: "inclua diagnosticos de causa e efeito no dashboard de
// crm klaviyo, cac e no dashboard principal".
//
// Reusable rules (subset of executive-diagnostics):
//   1. KPI primary health (good/warning/critical)
//   2. Pacing divergence (first half vs second half of window)
//   3. Daily Pearson correlation between investment and outcome
//   4. Best vs worst day for the primary KPI
//   5. Sharpest single-day drop in the outcome KPI
//   6. Marginal sensitivity (β) of outcome to investment

export type DiagnosticSeverity = "positive" | "info" | "warning" | "critical";

export type Diagnostic = {
  id: string;
  severity: DiagnosticSeverity;
  cause: string;
  effect: string;
  evidence: string[];
  recommendation?: string;
};

export type DailyPt = { date: string; value: number };

export interface GenericInput {
  // Label config for messages
  domain: "ads" | "email" | "customer-acquisition";
  invName: string;        // "spend", "investment", "send volume"
  outName: string;        // "sales", "new customers", "revenue"
  efficiencyName: string; // "ROAS", "CAC", "RPR"
  efficiencyUnit?: "×" | "$" | "%";

  // Daily series — must be same length and date-aligned
  invSeries: DailyPt[];
  outSeries: DailyPt[];

  // Aggregate KPIs (optional — used for health checks)
  totalInv?: number;
  totalOut?: number;
  efficiency?: number;        // ROAS or CAC value
  efficiencyHealthyAt?: number; // threshold for "healthy"
  efficiencyCriticalAt?: number; // threshold for "critical"

  // Optional formatter for currency/numbers (defaults to USD)
  fmt?: (v: number) => string;
}

function safeDiv(a: number, b: number): number { return b === 0 ? 0 : a / b; }
function avg(arr: number[]): number { return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length; }
function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
}
function fmtPct(n: number): string { const sign = n > 0 ? "+" : ""; return `${sign}${n.toFixed(1)}%`; }
function fmtMoneyDefault(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export function computeGenericDiagnostics(input: GenericInput): Diagnostic[] {
  const out: Diagnostic[] = [];
  const fmt = input.fmt ?? fmtMoneyDefault;
  const invSeries = input.invSeries.map((d) => d.value);
  const outSeries = input.outSeries.map((d) => d.value);

  // --- 1) Efficiency KPI health (ROAS/CAC/RPR) ---
  if (input.efficiency != null && input.efficiencyHealthyAt != null && input.efficiencyCriticalAt != null) {
    const e = input.efficiency;
    if (e <= input.efficiencyCriticalAt) {
      out.push({
        id: "efficiency-critical",
        severity: "critical",
        cause: `${input.efficiencyName} at ${e.toFixed(2)}${input.efficiencyUnit ?? ""} — critical threshold`,
        effect: `Outcome per unit of investment is below the safe zone. ${input.invName} is barely converting.`,
        evidence: [
          `Total ${input.invName}: ${fmt(input.totalInv ?? 0)}`,
          `Total ${input.outName}: ${fmt(input.totalOut ?? 0)}`,
          `Healthy: ${input.efficiencyHealthyAt}${input.efficiencyUnit ?? ""} · Critical: ${input.efficiencyCriticalAt}${input.efficiencyUnit ?? ""}`,
        ],
        recommendation: `Pause or reduce ${input.invName} on the worst performers until ${input.efficiencyName} recovers.`,
      });
    } else if (e >= input.efficiencyHealthyAt) {
      out.push({
        id: "efficiency-healthy",
        severity: "positive",
        cause: `${input.efficiencyName} at ${e.toFixed(2)}${input.efficiencyUnit ?? ""} — above healthy threshold`,
        effect: `Each unit of ${input.invName} is generating strong returns. Room to scale.`,
        evidence: [
          `Total ${input.invName}: ${fmt(input.totalInv ?? 0)}`,
          `Total ${input.outName}: ${fmt(input.totalOut ?? 0)}`,
        ],
        recommendation: `Consider increasing ${input.invName} incrementally and re-measuring after 1-2 weeks.`,
      });
    }
  }

  // --- 2) Pacing divergence ---
  if (invSeries.length >= 4) {
    const mid = Math.floor(invSeries.length / 2);
    const invFirst = avg(invSeries.slice(0, mid));
    const invSecond = avg(invSeries.slice(mid));
    const outFirst = avg(outSeries.slice(0, mid));
    const outSecond = avg(outSeries.slice(mid));
    const invDelta = pctChange(invSecond, invFirst);
    const outDelta = pctChange(outSecond, outFirst);
    const gap = invDelta - outDelta;

    if (Math.abs(gap) >= 10) {
      const decelerating = gap > 0;
      out.push({
        id: "pacing-divergence",
        severity: decelerating ? "warning" : "positive",
        cause: decelerating
          ? `${input.invName} grew ${fmtPct(invDelta)} but ${input.outName} only ${fmtPct(outDelta)} (second half vs first half)`
          : `${input.outName} accelerated faster than ${input.invName} (${fmtPct(outDelta)} vs ${fmtPct(invDelta)})`,
        effect: decelerating
          ? `Marginal ${input.efficiencyName} is decreasing — extra ${input.invName} is buying less ${input.outName}.`
          : `Marginal ${input.efficiencyName} is improving — campaigns are scaling efficiently.`,
        evidence: [
          `1st half avg ${input.invName}: ${fmt(invFirst)} · ${input.outName}: ${fmt(outFirst)}`,
          `2nd half avg ${input.invName}: ${fmt(invSecond)} · ${input.outName}: ${fmt(outSecond)}`,
          `Efficiency gap: ${fmtPct(gap)}`,
        ],
        recommendation: decelerating
          ? `Pull back ${input.invName} on the underperformers. Check breakdown for the lagging segment.`
          : `Sustain or marginally increase ${input.invName} — the curve is still bending up.`,
      });
    }
  }

  // --- 3) Pearson correlation ---
  if (invSeries.length >= 7 && outSeries.length === invSeries.length) {
    const ms = avg(invSeries);
    const mr = avg(outSeries);
    let num = 0, denS = 0, denR = 0;
    for (let i = 0; i < invSeries.length; i++) {
      const ds = invSeries[i] - ms;
      const dr = outSeries[i] - mr;
      num += ds * dr;
      denS += ds * ds;
      denR += dr * dr;
    }
    const r = denS > 0 && denR > 0 ? num / Math.sqrt(denS * denR) : 0;
    if (Math.abs(r) >= 0.3) {
      const strength = Math.abs(r) >= 0.75 ? "strong" : Math.abs(r) >= 0.5 ? "moderate" : "weak";
      const direction = r > 0 ? "positive" : "negative";
      out.push({
        id: "correlation",
        severity: r > 0.5 ? "positive" : "info",
        cause: `Daily ${input.invName} ↔ daily ${input.outName} correlation = ${r.toFixed(2)} (${strength} ${direction})`,
        effect:
          r > 0.5
            ? `When ${input.invName} goes up, ${input.outName} follows on the same day. Direct lever.`
            : r > 0
            ? `${input.outName} partially follows ${input.invName} but other factors drive most of the variance.`
            : `${input.outName} tends to move opposite to ${input.invName} — likely organic/seasonal noise dominates.`,
        evidence: [
          `Pearson r: ${r.toFixed(3)} (n=${invSeries.length} days)`,
          `r²=${(r * r).toFixed(2)} → ${Math.round(r * r * 100)}% of daily variance explained`,
          `Avg ${input.invName}: ${fmt(ms)} · Avg ${input.outName}: ${fmt(mr)}`,
        ],
      });
    }
  }

  // --- 4) Sharpest spend surge ---
  if (invSeries.length >= 3) {
    let bestDay = -1;
    let bestSurge = 0;
    for (let i = 1; i < invSeries.length; i++) {
      const surge = pctChange(invSeries[i], invSeries[i - 1]);
      if (surge > bestSurge) { bestSurge = surge; bestDay = i; }
    }
    if (bestDay > 0 && bestSurge > 30) {
      const date = input.invSeries[bestDay]?.date;
      const prevDate = input.invSeries[bestDay - 1]?.date;
      const outDelta = pctChange(outSeries[bestDay], outSeries[bestDay - 1]);
      const efficient = outDelta >= bestSurge * 0.5;
      out.push({
        id: "spend-push-impact",
        severity: efficient ? "positive" : "warning",
        cause: `${input.invName} surged ${fmtPct(bestSurge)} from ${prevDate} to ${date}`,
        effect: efficient
          ? `${input.outName} responded with +${fmtPct(outDelta)} — the push paid off.`
          : `${input.outName} only moved ${fmtPct(outDelta)} — the surge was inefficient.`,
        evidence: [
          `${prevDate}: ${input.invName} ${fmt(invSeries[bestDay - 1])} · ${input.outName} ${fmt(outSeries[bestDay - 1])}`,
          `${date}: ${input.invName} ${fmt(invSeries[bestDay])} · ${input.outName} ${fmt(outSeries[bestDay])}`,
          `Δ ${input.invName}: ${fmtPct(bestSurge)} · Δ ${input.outName}: ${fmtPct(outDelta)}`,
        ],
        recommendation: efficient
          ? `Replicate the pattern — what was different that day?`
          : `Avoid blanket budget surges. Marginal return below 50% of marginal ${input.invName}.`,
      });
    }
  }

  // --- 5) Sharpest single-day drop ---
  if (outSeries.length >= 7) {
    const mAvg = avg(outSeries);
    const drops = input.outSeries
      .map((d, i) => ({ d, drop: mAvg > 0 ? (mAvg - d.value) / mAvg : 0 }))
      .filter((x) => x.drop >= 0.4 && x.d.value > 0);
    if (drops.length > 0) {
      const worst = drops.sort((a, b) => b.drop - a.drop)[0];
      out.push({
        id: "daily-drop",
        severity: "warning",
        cause: `On ${worst.d.date}, ${input.outName} was ${(worst.drop * 100).toFixed(0)}% below the window average`,
        effect: `Single-day shock. Investigate cause — campaign pause, outage, holiday or seasonality.`,
        evidence: [
          `${worst.d.date}: ${fmt(worst.d.value)} (avg ${fmt(mAvg)})`,
          `${drops.length} day(s) flagged with drop ≥40%`,
        ],
        recommendation: `Cross-check site availability, inventory, campaign delivery and external events for ${worst.d.date}.`,
      });
    }
  }

  // --- 6) Marginal sensitivity (β) ---
  if (invSeries.length >= 5) {
    const ms = avg(invSeries);
    const mr = avg(outSeries);
    let num = 0, den = 0;
    for (let i = 0; i < invSeries.length; i++) {
      const ds = invSeries[i] - ms;
      const dr = outSeries[i] - mr;
      num += ds * dr;
      den += ds * ds;
    }
    const beta = den > 0 ? num / den : 0;
    if (beta > 0 && input.domain === "ads") {
      out.push({
        id: "spend-sensitivity",
        severity: beta > 3 ? "positive" : beta > 1 ? "info" : "warning",
        cause: `Marginal ${input.efficiencyName} (β) = ${beta.toFixed(2)} — each $1 of extra ${input.invName} brings about ${fmt(beta)} in ${input.outName}`,
        effect:
          beta > 3
            ? `Strong leverage: budgets still in the productive zone. Room to scale.`
            : beta > 1
            ? `Healthy leverage — adding budget recovers itself with margin.`
            : `Saturation zone — extra dollars barely cover themselves.`,
        evidence: [
          `Linear regression β across ${invSeries.length} days`,
          beta < (input.efficiency ?? 0)
            ? `β < avg ${input.efficiencyName} → diminishing returns active`
            : `β ≥ avg ${input.efficiencyName} → still scaling productively`,
        ],
        recommendation:
          beta > 2
            ? `Increase budget incrementally and re-measure β after 2 weeks.`
            : `Don't push budget up; first optimize creative/audience to lift β.`,
      });
    }
  }

  // Sort by severity (critical → warning → info → positive)
  const sevOrder: Record<DiagnosticSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
  out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
  return out;
}
