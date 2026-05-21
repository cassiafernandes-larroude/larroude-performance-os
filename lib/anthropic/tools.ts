import type Anthropic from "@anthropic-ai/sdk";
import { getMetricBundle } from "@/lib/data/metrics";
import { runDiagnostics } from "@/lib/intelligence/diagnostics";
import type { Market, Period } from "@/types/metric";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "query_metrics",
    description: "Consulta metricas agregadas de performance (spend, ROAS, vendas, CAC, etc.) para um mercado e periodo. Use sempre que o usuario perguntar sobre numeros de performance.",
    input_schema: {
      type: "object",
      properties: {
        market: {
          type: "string",
          enum: ["US", "BR"],
          description: "Mercado: US ou BR",
        },
        period: {
          type: "string",
          enum: ["7d", "14d", "28d", "3M", "6M", "12M"],
          description: "Janela temporal",
        },
      },
      required: ["market", "period"],
    },
  },
  {
    name: "list_diagnostics",
    description: "Lista os diagnosticos automaticos detectados pelo engine de regras cruzando fontes. Use quando o usuario perguntar 'o que esta errado', 'quais alertas', 'diagnostico atual', etc.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["7d", "14d", "28d", "3M", "6M", "12M"],
          description: "Janela temporal para gerar diagnosticos",
        },
        severity: {
          type: "string",
          enum: ["critical", "warning", "positive", "info", "all"],
          description: "Filtro de severidade. 'all' retorna tudo.",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "compare_markets",
    description: "Compara uma metrica especifica entre US e BR no mesmo periodo. Use para perguntas tipo 'compara CVR US vs BR' ou 'qual mercado esta crescendo mais'.",
    input_schema: {
      type: "object",
      properties: {
        metric_key: {
          type: "string",
          description: "Chave da metrica (ex: roas_gross, cac, gross_sales, orders, aov)",
        },
        period: {
          type: "string",
          enum: ["7d", "14d", "28d", "3M", "6M", "12M"],
        },
      },
      required: ["metric_key", "period"],
    },
  },
  {
    name: "get_kpi_definition",
    description: "Retorna a definicao canonica de um KPI (formula, notas). Use quando o usuario perguntar 'o que e X' ou 'como calculamos Y'.",
    input_schema: {
      type: "object",
      properties: {
        kpi: {
          type: "string",
          description: "Sigla do KPI (CAC, nCAC, CRC, LTV, ROAS, AOV, CVR, CTR, CPO, CPA, LTV:CAC)",
        },
      },
      required: ["kpi"],
    },
  },
];

const KPI_DEFINITIONS: Record<string, { name: string; formula: string; notes: string }> = {
  CAC: { name: "Customer Acquisition Cost", formula: "total_marketing_spend / new_customers", notes: "Inclui todos os canais pagos" },
  nCAC: { name: "New Customer Acquisition Cost", formula: "paid_ads_spend / new_customers_from_paid", notes: "So trafego pago atribuido" },
  CRC: { name: "Customer Retention Cost", formula: "(Klaviyo + Meta retargeting) / retained_customers", notes: "Cliente que comprou >= 2x" },
  LTV: { name: "Customer Lifetime Value", formula: "Receita acumulada media por cliente, janela 12m", notes: "" },
  "LTV:CAC": { name: "Razao de eficiencia", formula: "LTV / CAC", notes: "Saudavel >= 3:1" },
  ROAS: { name: "Return on Ad Spend", formula: "revenue / spend", notes: "Pode ser gross ou order" },
  AOV: { name: "Average Order Value", formula: "revenue / orders", notes: "" },
  CVR: { name: "Conversion Rate", formula: "purchases / sessions", notes: "" },
  CTR: { name: "Click-Through Rate", formula: "clicks / impressions", notes: "Meta / Google" },
  CPO: { name: "Cost Per Order", formula: "spend / orders", notes: "" },
  CPA: { name: "Cost Per Acquisition", formula: "spend / conversions (pixel)", notes: "Atribuicao Meta" },
};

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ ok: boolean; result: unknown; error?: string }> {
  try {
    switch (name) {
      case "query_metrics": {
        const market = input.market as Market;
        const period = input.period as Period;
        const bundle = await getMetricBundle(market, period);
        return { ok: true, result: bundle };
      }
      case "list_diagnostics": {
        const period = input.period as Period;
        const severity = (input.severity as string) || "all";
        const [us, br] = await Promise.all([
          getMetricBundle("US", period),
          getMetricBundle("BR", period),
        ]);
        let all = await runDiagnostics({ us, br });
        if (severity !== "all") all = all.filter((d) => d.severity === severity);
        return { ok: true, result: { count: all.length, diagnostics: all } };
      }
      case "compare_markets": {
        const metricKey = input.metric_key as string;
        const period = input.period as Period;
        const [us, br] = await Promise.all([
          getMetricBundle("US", period),
          getMetricBundle("BR", period),
        ]);
        const usM = us.metrics.find((m) => m.key === metricKey);
        const brM = br.metrics.find((m) => m.key === metricKey);
        return {
          ok: true,
          result: {
            metric: metricKey,
            period,
            US: usM ? { value: usM.value, formatted: usM.formatted, delta: usM.delta_label } : null,
            BR: brM ? { value: brM.value, formatted: brM.formatted, delta: brM.delta_label } : null,
          },
        };
      }
      case "get_kpi_definition": {
        const kpi = (input.kpi as string).toUpperCase();
        const def = KPI_DEFINITIONS[kpi];
        if (!def) return { ok: false, result: null, error: `KPI '${kpi}' nao encontrado` };
        return { ok: true, result: { kpi, ...def } };
      }
      default:
        return { ok: false, result: null, error: `tool '${name}' nao implementada` };
    }
  } catch (err) {
    return { ok: false, result: null, error: String(err) };
  }
}
