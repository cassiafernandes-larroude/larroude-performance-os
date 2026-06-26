"use client";

// Cassia 2026-06-26: aba Forecast de produção.
// Regra: previsão = venda real da MESMA ESTAÇÃO de 2025 × crescimento (default 1,30).
// Lançamentos sem 2025 → run-rate recente × crescimento (badge "run-rate").
import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Download, Search } from "lucide-react";

type Level = "categoria" | "modelo" | "sku";
type Market = "US" | "BR";
interface Row { key: string; metodo: "YoY" | "run-rate"; weekly: number[]; total: number; }
interface Result {
  market: Market; level: Level; growth: number; from: string; to: string;
  weeks: string[]; rows: Row[]; generatedAt: string;
}

const LEVELS: { id: Level; label: string }[] = [
  { id: "categoria", label: "Categoria" },
  { id: "modelo", label: "Modelo" },
  { id: "sku", label: "SKU completo" },
];

function wkLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
const nf = new Intl.NumberFormat("pt-BR");

export default function ForecastView() {
  const [market, setMarket] = useState<Market>("US");
  const [level, setLevel] = useState<Level>("sku");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    fetch(`/api/forecast?market=${market}&level=${level}`)
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error) setErr(j.error); else setData(j); })
      .catch((e) => alive && setErr(String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [market, level]);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return term ? data.rows.filter((r) => r.key.toLowerCase().includes(term)) : data.rows;
  }, [data, q]);

  const totals = useMemo(() => {
    if (!data) return { weekly: [] as number[], total: 0 };
    const weekly = new Array(data.weeks.length).fill(0);
    let total = 0;
    for (const r of rows) { r.weekly.forEach((n, i) => (weekly[i] += n)); total += r.total; }
    return { weekly, total };
  }, [rows, data]);

  function downloadCsv() {
    if (!data) return;
    const head = ["item", "metodo", ...data.weeks.map(wkLabel), "total"].join(",");
    const body = rows.map((r) => [r.key, r.metodo, ...r.weekly, r.total].join(",")).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `forecast-${market}-${level}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-5 lg:p-8 max-w-full">
      {/* Header */}
      <div className="flex items-start gap-3 mb-1">
        <TrendingUp className="w-6 h-6 mt-0.5" style={{ color: "var(--pink)" }} />
        <div>
          <h1 className="font-display text-[22px]" style={{ color: "var(--ink)" }}>
            Forecast de Produção
          </h1>
          <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
            Só dados reais. Volume por SKU = <b>maior</b> entre (venda da mesma estação de 2025 ×{" "}
            <b>crescimento real do modelo</b>) e o <b>run-rate recente</b>; distribuído pela{" "}
            <b>sazonalidade semanal real da categoria</b> (2024+2025). Só SKUs ≥100 un. que somam &gt;50% do faturamento.
          </p>
        </div>
      </div>
      {data && (
        <p className="text-[11px] mb-4" style={{ color: "var(--ink-muted)" }}>
          Janela {wkLabel(data.from)} → {wkLabel(data.to)} · última semana parcial · gerado{" "}
          {new Date(data.generatedAt).toLocaleString("pt-BR")}
        </p>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {(["US", "BR"] as Market[]).map((m) => (
            <button key={m} onClick={() => setMarket(m)}
              className="px-3 py-1.5 text-[13px] font-num"
              style={{ background: market === m ? "var(--pink)" : "transparent", color: market === m ? "white" : "var(--ink-soft)" }}>
              {m}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {LEVELS.map((l) => (
            <button key={l.id} onClick={() => setLevel(l.id)}
              className="px-3 py-1.5 text-[13px]"
              style={{ background: level === l.id ? "var(--pink)" : "transparent", color: level === l.id ? "white" : "var(--ink-soft)" }}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ border: "1px solid var(--border)" }}>
          <Search className="w-3.5 h-3.5" style={{ color: "var(--ink-muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar item…"
            className="bg-transparent outline-none text-[13px] w-40" style={{ color: "var(--ink)" }} />
        </div>
        <button onClick={downloadCsv} disabled={!data}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px]"
          style={{ border: "1px solid var(--border)", color: "var(--ink-soft)" }}>
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Body */}
      {loading && <div className="text-[13px]" style={{ color: "var(--ink-muted)" }}>Carregando projeção…</div>}
      {err && <div className="text-[13px]" style={{ color: "#c0392b" }}>Erro: {err}</div>}

      {data && !loading && !err && (
        <div className="overflow-x-auto scroll-area rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-[12px] font-num" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--paper-deep)" }}>
                <th className="text-left px-3 py-2 sticky left-0 z-10" style={{ background: "var(--paper-deep)", color: "var(--ink-soft)", minWidth: 190 }}>
                  Item ({rows.length})
                </th>
                <th className="px-2 py-2" style={{ color: "var(--ink-muted)" }}>método</th>
                {data.weeks.map((w) => (
                  <th key={w} className="text-right px-2.5 py-2 whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>{wkLabel(w)}</th>
                ))}
                <th className="text-right px-3 py-2" style={{ color: "var(--ink)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderTop: "1px solid var(--border)", fontWeight: 600 }}>
                <td className="px-3 py-2 sticky left-0" style={{ background: "var(--paper)", color: "var(--ink)" }}>TOTAL</td>
                <td></td>
                {totals.weekly.map((n, i) => (<td key={i} className="text-right px-2.5 py-2" style={{ color: "var(--ink)" }}>{nf.format(n)}</td>))}
                <td className="text-right px-3 py-2" style={{ color: "var(--ink)" }}>{nf.format(totals.total)}</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-3 py-1.5 sticky left-0" style={{ background: "var(--paper)", color: "var(--ink)" }}>{r.key}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: r.metodo === "YoY" ? "var(--border)" : "rgba(214,137,16,0.15)", color: r.metodo === "YoY" ? "var(--ink-soft)" : "#b8730a" }}>
                      {r.metodo}
                    </span>
                  </td>
                  {r.weekly.map((n, i) => (
                    <td key={i} className="text-right px-2.5 py-1.5" style={{ color: n === 0 ? "var(--ink-muted)" : "var(--ink-soft)" }}>{n === 0 ? "·" : nf.format(n)}</td>
                  ))}
                  <td className="text-right px-3 py-1.5" style={{ color: "var(--ink)", fontWeight: 600 }}>{nf.format(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
