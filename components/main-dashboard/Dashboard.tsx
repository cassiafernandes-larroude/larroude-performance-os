'use client';

import type { DashboardPayload } from '@/lib/main-dashboard/types';
import KpiGrid from './KpiGrid';
import FunnelChart from './FunnelChart';
import DailyBarChart from './DailyBarChart';
import DailyMultiBarChart from './DailyMultiBarChart';
import ChannelBreakdown from './ChannelBreakdown';
import CampaignTable from './CampaignTable';
import AlertsPanel from './AlertsPanel';

interface Props { data: DashboardPayload; dimmed?: boolean; }

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-bold uppercase tracking-[0.15em] text-ink mt-8 mb-4 flex items-center gap-2.5">
    <span className="inline-block w-1 h-4 bg-accent rounded-full" />
    {children}
  </div>
);

export default function Dashboard({ data, dimmed }: Props) {
  const { market, kpis, funnel, daily, channels, topCampaigns, campaigns, alerts, period } = data;

  // Layout 2-colunas para períodos com poucos buckets (gráficos curtos):
  //   7d  → 7 buckets diários  → 2 colunas
  //   14d → 14 buckets diários → 2 colunas
  //   28d → 28 buckets diários → largura total
  //   3M  → ~13 buckets semanais → 2 colunas
  //   6M  → 6 buckets mensais  → 2 colunas
  //   12M → 12 buckets mensais → 2 colunas
  const bucketCount = (daily.gross_sales?.length ?? 0) || (daily.spend?.length ?? 0);
  const isCompact = bucketCount > 0 && bucketCount <= 14;
  const gridCls = isCompact ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4' : 'space-y-4 mt-4';

  return (
    <div className={`transition-opacity ${dimmed ? 'opacity-60' : 'opacity-100'}`}>
      {/* KPIs */}
      <KpiGrid kpis={kpis} market={market} />

      {/* Funil — passa Order Revenue total pro card CVR FINAL */}
      <FunnelChart
        funnel={funnel}
        market={market}
        revenue={kpis.find((k) => k.label === 'ORDER REVENUE' || k.label === 'GROSS SALES')?.raw ?? 0}
      />

      {/* Canais e campanhas - logo apos Conversoes por Etapa */}
      <SectionHeader>📡 CANAIS E CAMPANHAS — {market}</SectionHeader>
      <ChannelBreakdown channels={channels} topCampaigns={topCampaigns} market={market} />

      {/* Receita diária */}
      <SectionHeader>📅 RECEITA DIÁRIA — {market}</SectionHeader>
      <div className={gridCls}>
        <DailyBarChart title="Total Sales − Spend (margem pós-mídia)" data={daily.margin_total_sales ?? []} color="#0d9488" unit="currency" market={market} />
        <DailyBarChart title="Order Revenue − Spend (margem pré-refunds)" data={daily.margin_order_revenue ?? []} color="#3b82f6" unit="currency" market={market} />
        <DailyBarChart title="Gross Sales" data={daily.gross_sales ?? []} color="#1e3a8a" unit="currency" market={market} />
        <DailyBarChart title="Total Sales (Order Revenue − Returns)" data={daily.total_sales ?? []} color="#0d9488" unit="currency" market={market} />
        <DailyBarChart title="Order Revenue (Gross + Tax + Shipping − Discounts)" data={daily.order_revenue ?? []} color="#3b82f6" unit="currency" market={market} />
        <DailyBarChart title="Returns" data={daily.returns ?? []} color="#ef4444" unit="currency" market={market} />
        <DailyBarChart title="Discounts" data={daily.discounts ?? []} color="#f59e0b" unit="currency" market={market} />
      </div>

      {/* Custos e eficiência */}
      <SectionHeader>💸 CUSTOS E EFICIÊNCIA — {market}</SectionHeader>
      <div className={gridCls}>
        <DailyBarChart title="Amount Spent (Ad Cost)" data={daily.spend ?? []} color="#1f2d44" unit="currency" market={market} />
        <DailyBarChart title="ROAS Gross Sales" data={daily.roas_gross ?? []} color="#3b82f6" unit="multiple" market={market} />
        <DailyBarChart title="ROAS Order Revenue" data={daily.roas_order ?? []} color="#2563eb" unit="multiple" market={market} />
        <DailyBarChart title="ROAS Total Sales" data={daily.roas_total ?? []} color="#0d9488" unit="multiple" market={market} />
        <DailyBarChart title="Avg. Order Value (AOV)" data={daily.aov ?? []} color="#0891b2" unit="currency" market={market} />
        <DailyBarChart title="CPO — Cost per Order" data={daily.cpo ?? []} color="#c2410c" unit="currency" market={market} />
        <DailyBarChart title="CPA (Spend / Pixel Purch.)" data={daily.cpa ?? []} color="#ef4444" unit="currency" market={market} />
        <DailyBarChart title="CAC (Spend / Novos Clientes)" data={daily.cac ?? []} color="#8b5cf6" unit="currency" market={market} />
        <DailyBarChart title="Taxa de Conversão (Shopify)" data={daily.cvr ?? []} color="#0d9488" unit="percent" market={market} />
      </div>

      {/* Volume e Funil */}
      <SectionHeader>📦 VOLUME E FUNIL — {market}</SectionHeader>
      <div className={gridCls}>
        <DailyBarChart title="Orders — Shopify" data={daily.orders ?? []} color="#1f2d44" unit="number" market={market} />
        <DailyMultiBarChart
          title="Funil Diário: Pixel Purchases vs Orders"
          market={market}
          series={[
            { key: 'orders', label: 'Orders (Shopify)', data: daily.orders ?? [], color: '#3b82f6' },
            { key: 'pixel', label: 'Purchases (Meta Pixel)', data: daily.pixel_purchases ?? [], color: '#10b981' },
          ]}
        />
      </div>

      {/* Seção TRÁFEGO removida por solicitação — números de sessões não eram confiáveis */}
      {/* CANAIS E CAMPANHAS foi movido para logo após CONVERSÕES POR ETAPA (acima) */}

      {/* Receita por canal — um gráfico em barra por canal */}
      <SectionHeader>📊 RECEITA POR CANAL (DIÁRIA) — {market}</SectionHeader>
      <div className={gridCls}>
        {(() => {
          // Mapa de slug por canal (inclui Criteo!)
          const slugFor = (channel: string): string => {
            if (channel === 'Sem UTM / Direto') return 'sem_utm_direto';
            if (channel === 'Meta Ads') return 'meta_ads';
            if (channel === 'Google Ads') return 'google_ads';
            if (channel === 'Klaviyo Email') return 'klaviyo_email';
            if (channel === 'SMS Attentive') return 'sms_attentive';
            if (channel === 'Awin Affiliate') return 'awin_affiliate';
            if (channel === 'ShopMy') return 'shopmy';
            if (channel === 'Criteo') return 'criteo';
            if (channel === 'Agent.shop') return 'agent_shop';
            if (channel === 'Orgânico Social (IG)') return 'organico_social_ig';
            return 'outros';
          };
          // Dedup por slug — evita 3 charts "Outros" se canais não-mapeados caírem no mesmo bucket
          const seen = new Set<string>();
          const uniqueChannels = channels.filter((ch) => {
            const slug = slugFor(ch.channel);
            if (seen.has(slug)) return false;
            seen.add(slug);
            return true;
          });
          return uniqueChannels.map((ch) => {
            const slug = slugFor(ch.channel);
            const seriesKey = `channel_${slug}`;
            const series = (daily as any)[seriesKey] ?? [];
            if (series.length === 0) return null;
            return (
              <DailyBarChart
                key={seriesKey}
                title={`${ch.channel} — Receita`}
                data={series}
                color={ch.color ?? '#64748b'}
                unit="currency"
                market={market}
              />
            );
          });
        })()}
      </div>

      <CampaignTable campaigns={campaigns} market={market} />

      {/* Seção ALERTAS & AÇÕES RECOMENDADAS removida por solicitação */}
    </div>
  );
}
