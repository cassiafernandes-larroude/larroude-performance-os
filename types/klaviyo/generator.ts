// Cassia 2026-06-20: tipos do Gerador de Campanhas Klaviyo (objetivo + criativos → template + assunto + segmento).
import type { Market, Period, CampaignType } from './models';

// Os 6 tipos do dashboard: MARKDOWN | FLASH | PREORDER | FULLPRICE | VIP | OTHER.
export type { CampaignType };

// Um criativo fornecido pela usuária (imagem hospedada + link de destino).
export interface CreativeInput {
  imageUrl: string;
  altText?: string;
  caption?: string;     // copy opcional associada à imagem
}

// Input do formulário.
export interface GeneratorInput {
  market: Market;
  type: CampaignType;           // 1 dos 6 tipos do dashboard
  objective: string;            // texto livre descrevendo a campanha
  creatives: CreativeInput[];
  destinationUrl: string;       // CTA principal
  offer?: string;               // ex.: "20% OFF", "Frete grátis"
  productName?: string;         // produto/coleção em foco
  revenueGoal?: number;         // meta de faturamento com o e-mail (na moeda do mercado)
  period?: Period;              // janela do histórico (default 6M)
}

// ---- Contexto de performance histórica passado ao Claude ----
export interface HistoricalCampaign {
  name: string;
  type: string;          // tipo da convenção (FP/MD/PO/CS/OTHER)
  subject?: string;      // assunto real (top campanhas)
  previewText?: string;
  openRate: number;      // %
  clickRate: number;     // %
  rpr: number;           // revenue per recipient
  revenue: number;
  recipients: number;
  sendDate: string;
}

export interface AudienceOption {
  id: string;
  name: string;
  kind: 'segment' | 'list';
  recipients?: number;   // histórico (quando houver)
  openRate?: number;
  clickRate?: number;
  rpr?: number;
}

export interface BestDay {
  dayName: string;
  avgOpenRate: number;
  avgRpr: number;
  campaigns: number;
}

export interface BenchmarkByType {
  type: string;
  avgOpenRate: number;
  avgClickRate: number;
  avgRpr: number;
  campaigns: number;
}

// Audiências já impactadas (mailed) numa janela recente — para evitar overlap/fadiga.
export interface RecentlyMailed {
  days: number;
  totalReach: number;
  audiences: AudienceOption[];
}

// Último e-mail enviado do tipo — base a ser duplicada (layout) com troca de imagem + copy.
export interface BaseTemplate {
  campaignId: string;
  campaignName: string;
  sendDate: string;
  html: string;
}

export interface PerformanceContext {
  market: Market;
  period: Period;
  currency: 'USD' | 'BRL';
  focusType: CampaignType;                 // tipo escolhido (FP/MD/PO/CS)
  focusTypeLabel: string;
  baseTemplate: BaseTemplate | null;        // último e-mail do tipo (HTML a duplicar)
  focusTypeCampaigns: HistoricalCampaign[]; // campanhas reais DESSE tipo (com assuntos vencedores)
  topCampaigns: HistoricalCampaign[];       // top geral (referência)
  audiences: AudienceOption[];              // opções reais para o Claude escolher
  recentlyMailed: RecentlyMailed;           // audiências impactadas nos últimos N dias
  bestDays: BestDay[];
  benchmarks: BenchmarkByType[];            // por tipo da convenção
  accountAvgOpenRate: number;
  accountAvgClickRate: number;
}

// ---- Saída do Claude (tool emit_campaign) ----
export interface SubjectOption {
  subject: string;
  previewText: string;
  rationale: string;     // por que, baseado no histórico
}

// Uma audiência recomendada (1+ formam a segmentação).
export interface SegmentRec {
  id: string;
  name: string;
  why?: string;
  estReach?: number;
  estRevenue?: number;
  rpr?: number;
}

// Plano para bater a meta de faturamento.
export interface GoalPlan {
  goal: number;
  currency: 'USD' | 'BRL';
  projectedRevenue: number;   // soma estimada das audiências escolhidas
  totalReach: number;
  achievable: boolean;        // projeção >= meta
  gap: number;                // quanto falta (0 se atingida)
}

export interface GeneratedCampaign {
  subjects: SubjectOption[];               // 3 opções
  segments: SegmentRec[];                  // 1+ audiências incluídas
  excludedSegments: SegmentRec[];          // exclusões (ex.: impactadas nos últimos 3 dias)
  segmentationRationale: string;
  goalPlan: GoalPlan | null;               // preenchido quando há meta de faturamento
  recommendedSendDay: string;              // ex.: "Quinta-feira ~10h"
  html?: string;                           // template completo — preenchido na 2ª etapa (generate-template)
  campaignNameSuggestion: string;
  rationale: string;                       // resumo estratégico
}

// Payload aprovado enviado para criar o draft.
export interface CreateDraftInput {
  market: Market;
  campaignName: string;
  subject: string;
  previewText: string;
  segmentIds: string[];                    // 1+ audiências incluídas
  excludedSegmentIds: string[];            // audiências excluídas
  html: string;
}

export interface CreateDraftResult {
  templateId: string;
  campaignId: string;
  messageId: string;
  campaignUrl: string;
}
