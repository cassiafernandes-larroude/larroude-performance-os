'use client';
// Cassia 2026-06-22: Aba Calendário — ações de US e BR do Asana (2026 Macro Calendar), com o
// resultado de vendas (GMV/unid/pedidos) de cada ação puxado ao vivo do BigQuery. Sem banco.

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, CalendarDays } from 'lucide-react';

type Market = 'US' | 'BR';

interface ActionResult { gmv: number; units: number; orders: number; basis: 'sku' | 'collection' | 'tag'; skuCount: number; tag?: string; window: { start: string; end: string }; partial?: boolean; }
interface Action {
  gid: string; title: string; url: string; week: string; category: string[];
  market: 'US' | 'BR' | 'BOTH';
  startOn: string | null; dueOn: string | null; completed: boolean;
  skus: string[]; collectionId: string | null; dropTag: string | null;
  window: { start: string; end: string } | null;
  hasLink: boolean; result: ActionResult | null; resultError: string | null;
  status: 'no_link' | 'pending' | 'measured';
}
interface WeekGroup { week: string; actions: Action[]; }
interface Bundle {
  available: boolean; reason?: string; error?: string; market: Market;
  today?: string; weeks: WeekGroup[];
  totals?: { actions: number; linked: number; measured: number };
}

const CAT_COLOR: Record<string, string> = {
  Drop: '#5d4ec5', 'Pre-order': '#8b7ff0', Collab: '#ec4899', Sale: '#e11d48', Sales: '#e11d48',
  Campanhas: '#f59e0b', ADS: '#0ea5e9', CRM: '#10b981', 'Demandas semanais': '#94a3b8',
};
const catColor = (c: string) => CAT_COLOR[c] || '#94a3b8';

function fmtN(v: number) { return (v || 0).toLocaleString('pt-BR'); }
function fmtMoney(v: number, market: Market) {
  return new Intl.NumberFormat(market === 'BR' ? 'pt-BR' : 'en-US', {
    style: 'currency', currency: market === 'BR' ? 'BRL' : 'USD', maximumFractionDigits: 0,
  }).format(v || 0);
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

export default function CalendarDashboard() {
  const [market, setMarket] = useState<Market>('US');
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/calendar/${market}?n=${nonce}`, { cache: 'no-store' });
      const json = (await res.json()) as Bundle;
      setData(json);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [market, nonce]);

  useEffect(() => { load(); }, [load]);

  const notConfigured = data && !data.available && data.reason === 'asana_token';

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      {/* Header compacto (sem filtro de período — o calendário é o projeto inteiro) */}
      <div className="pt-4 pb-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[24px] sm:text-[28px] lg:text-[40px] font-bold leading-tight flex items-center gap-3" style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}>
            <CalendarDays className="w-7 h-7" style={{ color: 'var(--pink)' }} /> Calendário de Ações
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-soft)' }}>
            Agenda do Asana (2026 Macro Calendar) × resultado de vendas no BigQuery
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['US', 'BR'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMarket(m)}
              className="inline-flex items-center rounded-full text-[12px] sm:text-[13px] font-semibold px-3 sm:px-4 py-1.5 transition-all"
              style={market === m
                ? { background: '#ec4899', color: 'white' }
                : { background: '#ebe9e3', color: '#1a1a1a' }}
            >
              <span className="text-[10px] font-bold opacity-70 mr-1.5">{m}</span>
              {m === 'US' ? 'United States' : 'Brasil'}
            </button>
          ))}
          <button
            onClick={() => setNonce((n) => n + 1)}
            disabled={loading}
            className="pill pill-pink px-3 py-1.5 text-[12px] flex items-center gap-1.5 font-medium"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {loading && <div className="card text-center py-8" style={{ color: 'var(--ink-soft)' }}>Carregando calendário…</div>}
      {err && <div className="card border-rose-300 bg-rose-50 text-rose-700 text-sm">Erro: {err}</div>}

      {notConfigured && (
        <div className="card" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)' }}>
          <h3 className="font-semibold mb-2" style={{ color: '#b45309' }}>Conecte o Asana para ativar o calendário</h3>
          <p className="text-[13px] mb-3" style={{ color: 'var(--ink)' }}>Dois passos únicos de setup:</p>
          <ol className="text-[13px] space-y-2 list-decimal pl-5" style={{ color: 'var(--ink)' }}>
            <li>Na Vercel → projeto <code>larroude-performance-os</code> → Settings → Environment Variables, adicione <code>ASANA_ACCESS_TOKEN</code> (Personal Access Token gerado em Asana → Settings → Apps → Developer apps → Personal access tokens) e redeploy.</li>
            <li>No projeto <strong>2026 Macro Calendar</strong> do Asana, crie os campos: <code>SKUs</code> (texto), <code>Collection ID</code> (texto) e, opcional, <code>Mercado</code> (dropdown US/BR/Ambos). Preencha em cada ação que quiser medir.</li>
          </ol>
        </div>
      )}

      {data && !data.available && data.reason === 'error' && (
        <div className="card border-rose-300 bg-rose-50 text-rose-700 text-sm">
          <strong>Não foi possível ler o Asana.</strong> {data.error}
        </div>
      )}

      {data && data.available && (
        <div className="space-y-6">
          {data.totals && (
            <div className="flex flex-wrap gap-3">
              <Chip label="Ações no período" value={fmtN(data.totals.actions)} />
              <Chip label="Com vínculo (SKU/Collection)" value={fmtN(data.totals.linked)} />
              <Chip label="Com resultado medido" value={fmtN(data.totals.measured)} />
            </div>
          )}

          {data.weeks.length === 0 && (
            <div className="card text-center py-8" style={{ color: 'var(--ink-soft)' }}>
              Nenhuma ação para {market} no calendário.
            </div>
          )}

          {data.weeks.map((wk) => (
            <div key={wk.week} className="card">
              <h3 className="text-[14px] font-semibold mb-3 pb-2" style={{ color: 'var(--ink)', borderBottom: '1px solid var(--border)' }}>
                {wk.week}
              </h3>
              <div className="space-y-3">
                {wk.actions.map((a) => (
                  <ActionRow key={a.gid} a={a} market={market} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-4 py-2" style={{ background: 'var(--paper)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{label}</div>
      <div className="font-num font-bold text-[18px]" style={{ color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

function ActionRow({ a, market }: { a: Action; market: Market }) {
  return (
    <div className="rounded-xl p-3 flex flex-col lg:flex-row lg:items-center gap-3" style={{ background: 'var(--paper)', border: '1px solid var(--border)' }}>
      {/* Esquerda: ação */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {a.completed && <span title="Concluída" className="text-[12px]">✅</span>}
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold hover:underline inline-flex items-center gap-1" style={{ color: 'var(--ink)' }}>
            {a.title || '(sem título)'} <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
          {a.market !== 'BOTH' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#ebe9e3', color: '#1a1a1a' }}>{a.market}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          {a.category.map((c) => (
            <span key={c} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: catColor(c), background: `${catColor(c)}1a` }}>{c}</span>
          ))}
          <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            {a.startOn ? `${fmtDate(a.startOn)} → ${fmtDate(a.dueOn)}` : fmtDate(a.dueOn)}
          </span>
        </div>
      </div>

      {/* Direita: resultado */}
      <div className="lg:w-[340px] shrink-0">
        {a.status === 'no_link' && (
          <div className="text-[11px] italic" style={{ color: 'var(--ink-muted)' }}>
            Sem vínculo — preencha SKUs ou Collection ID no Asana
          </div>
        )}
        {a.status === 'pending' && (
          <div className="text-[11px] italic" style={{ color: 'var(--ink-muted)' }}>
            Aguardando a janela {a.window ? `(a partir de ${fmtDate(a.window.start)})` : ''}
          </div>
        )}
        {a.resultError && (
          <div className="text-[11px]" style={{ color: '#e11d48' }}>Erro no resultado: {a.resultError}</div>
        )}
        {a.status === 'measured' && a.result && (
          <div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Faturamento" value={fmtMoney(a.result.gmv, market)} color="#10b981" />
              <Metric label="Unidades" value={fmtN(a.result.units)} color="#5d4ec5" />
              <Metric label="Investido" value={a.result.spendOk ? fmtMoney(a.result.spend, market) : '—'} color="#e11d48" />
            </div>
            <div className="text-[9px] mt-1" style={{ color: 'var(--ink-muted)' }}>
              {fmtN(a.result.orders)} pedidos
              {a.result.roas != null ? ` · ROAS ${a.result.roas.toFixed(1)}×` : ''}
              {' · '}
              {a.result.basis === 'tag'
                ? `tag ${a.result.tag} · ${a.result.skuCount} produtos`
                : a.result.basis === 'collection'
                  ? `collection · ${a.result.skuCount} produtos`
                  : `${a.result.skuCount} SKU(s)`}
              {a.window ? ` · ${fmtDate(a.window.start)}–${fmtDate(a.window.end)}` : ''}
              {a.result.partial ? ' · ⚠ vendas parciais' : ''}
              {!a.result.spendOk ? ' · ⚠ investido indisponível (token Meta)' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg px-2 py-1.5 text-center" style={{ background: 'white', border: '1px solid var(--border)' }}>
      <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{label}</div>
      <div className="font-num font-bold text-[14px]" style={{ color }}>{value}</div>
    </div>
  );
}
