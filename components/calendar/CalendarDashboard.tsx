'use client';
// Cassia 2026-06-22: Aba Calendário — ações de US e BR do Asana (2026 Macro Calendar), com o
// resultado de vendas (GMV/unid/pedidos) de cada ação puxado ao vivo do BigQuery. Sem banco.

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ExternalLink, CalendarDays, ChevronRight, ChevronLeft, ChevronDown, Check } from 'lucide-react';

type Market = 'US' | 'BR';

interface ActionResult { gmv: number; units: number; orders: number; basis: 'sku' | 'collection' | 'tag' | 'sitewide' | 'attachment'; skuCount: number; tag?: string; spend: number; spendOk: boolean; roas: number | null; window: { start: string; end: string }; partial?: boolean; frozen?: boolean; }
interface Action {
  gid: string; title: string; url: string; week: string; category: string[];
  market: 'US' | 'BR' | 'BOTH';
  assignee?: string | null;
  startOn: string | null; dueOn: string | null; completed: boolean;
  skus: string[]; collectionId: string | null; dropTag: string | null; sitewide?: boolean;
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<'mensal' | 'lista'>('mensal');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/calendar/${market}?n=${nonce}`, { cache: 'no-store' });
      const json = (await res.json()) as Bundle;
      setData(json);
      setLastUpdated(new Date());
    } catch (e: any) {
      setErr(e?.message || 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [market, nonce]);

  useEffect(() => { load(); }, [load]);

  // Cassia 2026-06-22: auto-atualização às 11h e 16h (hora local) enquanto a aba estiver aberta.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function scheduleNext() {
      const now = new Date();
      const candidates = [11, 16].map((h) => { const d = new Date(now); d.setHours(h, 0, 0, 0); return d; });
      let next = candidates.find((d) => d.getTime() > now.getTime());
      if (!next) { next = new Date(now); next.setDate(now.getDate() + 1); next.setHours(11, 0, 0, 0); }
      timer = setTimeout(() => { setNonce((n) => n + 1); scheduleNext(); }, next.getTime() - now.getTime());
    }
    scheduleNext();
    return () => clearTimeout(timer);
  }, []);

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
            Agenda do Asana (2026 Macro Calendar) × resultado de vendas ao vivo do Shopify
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
            {lastUpdated ? `Atualizado ${lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ` : ''}atualiza automaticamente às 11h e 16h
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
          {/* Abas de visualização */}
          <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
            {([['mensal', 'Mensal'], ['lista', 'Lista']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-2 text-[13px] font-semibold -mb-px border-b-2 transition-colors"
                style={view === v
                  ? { color: 'var(--ink)', borderColor: 'var(--pink)' }
                  : { color: 'var(--ink-muted)', borderColor: 'transparent' }}
              >
                {label}
              </button>
            ))}
            {data.totals && (
              <span className="ml-auto text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                {data.totals.actions} ações · {data.totals.linked} com vínculo · {data.totals.measured} medidas
              </span>
            )}
          </div>

          {data.weeks.length === 0 && (
            <div className="card text-center py-8" style={{ color: 'var(--ink-soft)' }}>
              Nenhuma ação para {market} no calendário.
            </div>
          )}

          {view === 'mensal' && data.weeks.length > 0 && (
            <MonthGrid actions={data.weeks.flatMap((w) => w.actions)} />
          )}

          {view === 'lista' && data.weeks.map((wk) => (
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

interface SubTask { gid: string; name: string; completed: boolean; dueOn: string | null; }
interface DropProduct { title: string; sku: string; units?: number; revenue?: number; }

function ActionRow({ a, market }: { a: Action; market: Market }) {
  const isAds = a.category.includes('ADS');
  // Mostra SKUs ao clicar: drops (tag auto) e SKUs manuais. Collection ID NÃO lista SKUs
  // (a collection já é o identificador — não precisa puxar os produtos).
  const skuMode = !isAds && !a.sitewide && !a.collectionId && (!!a.dropTag || a.skus.length > 0);
  const expandable = isAds || skuMode;
  const [open, setOpen] = useState(false);
  const [subs, setSubs] = useState<SubTask[] | null>(null);
  const [prods, setProds] = useState<DropProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [detErr, setDetErr] = useState<string | null>(null);

  // SKUs manuais têm prioridade sobre a tag de drop. (Collection ID não entra — não lista SKUs.)
  const win = a.window ? `&since=${a.window.start}&until=${a.window.end}` : '';
  const skuQuery = a.skus.length > 0
    ? `skus=${encodeURIComponent(a.skus.join(','))}${win}`
    : a.dropTag
      ? `tag=${encodeURIComponent(a.dropTag)}${win}`
      : null;

  const toggle = useCallback(async () => {
    if (!expandable) return;
    const next = !open;
    setOpen(next);
    if (!next || loading) return;
    if (isAds && subs === null) {
      setLoading(true); setDetErr(null);
      try {
        const res = await fetch(`/api/calendar/subtasks/${a.gid}`, { cache: 'no-store' });
        const json = await res.json();
        setSubs(Array.isArray(json.subtasks) ? json.subtasks : []);
        if (!json.available && json.error) setDetErr(json.error);
      } catch (e: any) { setDetErr(e?.message || 'falha'); setSubs([]); }
      finally { setLoading(false); }
    } else if (skuMode && prods === null) {
      if (!skuQuery) { setProds([]); return; } // sale/ação sem vínculo → prompt
      setLoading(true); setDetErr(null);
      try {
        const res = await fetch(`/api/calendar/drop-skus/${market}?${skuQuery}`, { cache: 'no-store' });
        const json = await res.json();
        setProds(Array.isArray(json.products) ? json.products : []);
        if (!json.available && json.error) setDetErr(json.error);
      } catch (e: any) { setDetErr(e?.message || 'falha'); setProds([]); }
      finally { setLoading(false); }
    }
  }, [expandable, isAds, skuMode, skuQuery, open, loading, subs, prods, a.gid, market]);

  return (
    <div className="rounded-xl" style={{ background: 'var(--paper)', border: '1px solid var(--border)' }}>
      <div
        className={`p-3 flex flex-col lg:flex-row lg:items-center gap-3 ${expandable ? 'cursor-pointer hover:bg-black/[0.02]' : ''}`}
        onClick={expandable ? toggle : undefined}
        role={expandable ? 'button' : undefined}
      >
      {/* Esquerda: ação */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {expandable && (open ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-muted)' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--ink-muted)' }} />)}
          {a.completed && <span title="Concluída" className="text-[12px]">✅</span>}
          <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[13px] font-semibold hover:underline inline-flex items-center gap-1" style={{ color: 'var(--ink)' }}>
            {a.title || '(sem título)'} <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
          {a.market !== 'BOTH' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#ebe9e3', color: '#1a1a1a' }}>{a.market}</span>
          )}
          {isAds && <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>· subtarefas</span>}
          {skuMode && <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>· SKUs</span>}
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
              {a.result.basis === 'sitewide'
                ? 'site inteiro (todas as vendas DTC)'
                : a.result.basis === 'tag'
                  ? `tag ${a.result.tag} · ${a.result.skuCount} SKUs`
                  : a.result.basis === 'collection'
                    ? `collection · ${a.result.skuCount} SKUs`
                    : a.result.basis === 'attachment'
                      ? `planilha · ${a.result.skuCount} SKUs`
                      : `${a.result.skuCount} SKU(s)`}
              {a.window ? ` · ${fmtDate(a.window.start)}–${fmtDate(a.window.end)}` : ''}
              {a.result.partial ? ' · ⚠ vendas parciais' : ''}
              {!a.result.spendOk ? ' · ⚠ investido indisponível (token Meta)' : ''}
            </div>
            {a.result.basis === 'attachment' && (
              <div className="mt-1">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ color: '#0f6e56', background: 'rgba(29,158,117,0.12)' }} title="SKUs da planilha .xlsx anexada na tarefa — lista explícita e imutável da campanha.">
                  📄 lista da planilha
                </span>
              </div>
            )}
            {a.result.basis === 'collection' && (
              <div className="mt-1">
                {a.result.frozen ? (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ color: '#0f6e56', background: 'rgba(29,158,117,0.12)' }} title="SKUs congelados: composição que a collection tinha durante a janela da campanha.">
                    🔒 composição da janela
                  </span>
                ) : (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ color: '#b45309', background: 'rgba(245,158,11,0.14)' }} title="Sem snapshot para esta janela — usando a composição ATUAL da collection, que pode divergir da que rodou na campanha.">
                    ⚠ composição atual
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Detalhe — abre ao clicar: subtarefas (ADS) ou SKUs (drop) */}
      {expandable && open && (
        <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          {loading && <div className="text-[11px] py-1" style={{ color: 'var(--ink-muted)' }}>Carregando…</div>}
          {detErr && <div className="text-[11px] py-1" style={{ color: '#e11d48' }}>Erro: {detErr}</div>}

          {/* ADS → subtarefas */}
          {isAds && !loading && subs && subs.length === 0 && !detErr && (
            <div className="text-[11px] py-1" style={{ color: 'var(--ink-muted)' }}>Sem subtarefas.</div>
          )}
          {isAds && subs && subs.length > 0 && (
            <div className="mt-1 space-y-1">
              {subs.map((s) => (
                <div key={s.gid} className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--ink)' }}>
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded shrink-0"
                    style={{ border: `1px solid ${s.completed ? '#10b981' : 'var(--border)'}`, background: s.completed ? '#10b981' : 'transparent' }}
                  >
                    {s.completed && <Check className="w-3 h-3" style={{ color: 'white' }} />}
                  </span>
                  <span style={{ textDecoration: s.completed ? 'line-through' : 'none', color: s.completed ? 'var(--ink-muted)' : 'var(--ink)' }}>{s.name}</span>
                  {s.dueOn && <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>· {fmtDate(s.dueOn)}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Drop/Sale/linkadas → lista de SKUs/produtos */}
          {skuMode && !loading && prods && prods.length === 0 && !detErr && (
            <div className="text-[11px] py-1" style={{ color: 'var(--ink-muted)' }}>Nenhum produto encontrado para o vínculo.</div>
          )}
          {skuMode && prods && prods.length > 0 && (
            <div className="mt-1">
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--ink-muted)' }}>
                {prods.length} SKUs{a.skus.length === 0 && a.dropTag ? ` · tag ${a.dropTag}` : ''}
              </div>
              <div>
                <div className="flex items-center gap-3 text-[9px] uppercase tracking-wider pb-1" style={{ color: 'var(--ink-muted)', borderBottom: '1px solid var(--border)' }}>
                  <span className="flex-1">Produto</span>
                  <span className="w-[150px] shrink-0">SKU</span>
                  <span className="w-[70px] shrink-0 text-right">Unid.</span>
                  <span className="w-[90px] shrink-0 text-right">Faturamento</span>
                </div>
                {prods.map((p) => (
                  <div key={p.sku || p.title} className="flex items-center gap-3 text-[12px] py-0.5" style={{ color: 'var(--ink)' }}>
                    <span className="flex-1 truncate">{p.title}</span>
                    <span className="w-[150px] shrink-0 font-num text-[11px]" style={{ color: 'var(--ink-muted)' }}>{p.sku}</span>
                    <span className="w-[70px] shrink-0 text-right font-num">{p.units != null ? fmtN(p.units) : '—'}</span>
                    <span className="w-[90px] shrink-0 text-right font-num" style={{ color: '#10b981' }}>{p.revenue != null ? fmtMoney(p.revenue, market) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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

// Categoria principal + cor para os blocos da grade (esquema do print: DROP verde, SALES vermelho, ADS laranja).
function gridCat(cats: string[]): { label: string; color: string } {
  if (cats.some((c) => /drop|pre-?order/i.test(c))) return { label: 'DROP', color: '#10b981' };
  if (cats.some((c) => /sale/i.test(c))) return { label: 'SALES', color: '#e11d48' };
  if (cats.some((c) => /ads/i.test(c))) return { label: 'ADS', color: '#f59e0b' };
  if (cats.some((c) => /crm/i.test(c))) return { label: 'CRM', color: '#0ea5e9' };
  if (cats.some((c) => /campanha/i.test(c))) return { label: 'CAMPANHA', color: '#8b5cf6' };
  if (cats.some((c) => /collab/i.test(c))) return { label: 'COLLAB', color: '#ec4899' };
  return { label: (cats[0] || '—').toUpperCase(), color: '#94a3b8' };
}

const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function MonthGrid({ actions }: { actions: Action[] }) {
  // Mês inicial: o do "hoje". Navegação prev/next/hoje.
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const todayIso = isoDay(new Date());

  // Indexa ações por dia (start_on se houver, senão due_on).
  const byDay = new Map<string, Action[]>();
  for (const a of actions) {
    const day = a.startOn || a.dueOn;
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(a);
  }

  // Grade Mon→Sun cobrindo o mês (semanas completas).
  const first = new Date(cursor.y, cursor.m, 1);
  const startOffset = (first.getDay() + 6) % 7; // 0 = segunda
  const gridStart = new Date(cursor.y, cursor.m, 1 - startOffset);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const weeksCount = Math.ceil((startOffset + daysInMonth) / 7);
  const cells: Date[] = [];
  for (let i = 0; i < weeksCount * 7; i++) cells.push(new Date(cursor.y, cursor.m, 1 - startOffset + i));

  const shift = (delta: number) => setCursor((c) => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); };

  return (
    <div className="card">
      {/* Navegação do mês */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <button onClick={() => shift(-1)} className="pill pill-ghost px-2 py-1.5" aria-label="Mês anterior"><ChevronLeft className="w-4 h-4" /></button>
        <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>{MONTHS_PT[cursor.m]} de {cursor.y}</h3>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="pill pill-ghost px-3 py-1.5 text-[12px]">Hoje</button>
          <button onClick={() => shift(1)} className="pill pill-ghost px-2 py-1.5" aria-label="Próximo mês"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 880 }}>
          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-[10px] font-semibold uppercase tracking-wider text-center py-1" style={{ color: 'var(--ink-muted)' }}>{w}</div>
            ))}
          </div>
          {/* Células */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === cursor.m;
              const dIso = isoDay(d);
              const dayActions = byDay.get(dIso) || [];
              const isToday = dIso === todayIso;
              return (
                <div
                  key={i}
                  className="rounded-lg p-1.5 min-h-[120px] flex flex-col gap-1"
                  style={{ background: inMonth ? 'var(--paper)' : 'transparent', border: '1px solid var(--border)', opacity: inMonth ? 1 : 0.45 }}
                >
                  <div
                    className="text-[11px] font-semibold w-6 h-6 flex items-center justify-center rounded-full"
                    style={isToday ? { background: 'var(--pink)', color: 'white' } : { color: 'var(--ink-soft)' }}
                  >
                    {d.getDate()}
                  </div>
                  {dayActions.map((a) => {
                    const gc = gridCat(a.category);
                    return (
                      <a
                        key={a.gid}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded px-1.5 py-1 hover:brightness-95"
                        style={{ background: 'white', borderLeft: `3px solid ${gc.color}`, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                        title={a.title}
                      >
                        <div className="text-[8px] font-bold uppercase tracking-wide" style={{ color: gc.color }}>{gc.label}</div>
                        <div className="text-[10px] leading-tight font-medium truncate" style={{ color: 'var(--ink)', textDecoration: a.completed ? 'line-through' : 'none' }}>{a.title}</div>
                        {a.assignee && <div className="text-[8px] truncate" style={{ color: 'var(--ink-muted)' }}>{a.assignee}</div>}
                      </a>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
