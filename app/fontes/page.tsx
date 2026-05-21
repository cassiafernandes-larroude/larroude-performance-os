import { Database, CheckCircle2, XCircle, Clock } from "lucide-react";

type Source = {
  name: string;
  status: "ok" | "partial" | "missing";
  desc: string;
};

const sources: Source[] = [
  { name: "BigQuery — larroude-data-platform", status: "ok", desc: "Fonte da verdade · Service account configurado" },
  { name: "Meta Ads — US Larroudé", status: "ok", desc: "act_2047856822417350" },
  { name: "Meta Ads — US Pre-Order", status: "ok", desc: "act_929449929417505" },
  { name: "Meta Ads — BR (3 contas)", status: "partial", desc: "1 confirmada, 2 a confirmar" },
  { name: "Shopify US", status: "ok", desc: "larroude-com.myshopify.com" },
  { name: "Shopify BR", status: "ok", desc: "larroude-brasil.myshopify.com" },
  { name: "Google Ads", status: "partial", desc: "Falta refresh_token" },
  { name: "Klaviyo", status: "missing", desc: "API keys a configurar" },
  { name: "Anthropic API", status: "missing", desc: "Necessário para Fase 4 (Ask Claude)" },
];

export default function FontesPage() {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>
          Fontes de Dados
        </h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
          Status das integrações · BigQuery é a fonte primária
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {sources.map((s) => {
          const icon = s.status === "ok"
            ? <CheckCircle2 className="w-5 h-5" style={{ color: "var(--positive)" }} />
            : s.status === "partial"
            ? <Clock className="w-5 h-5" style={{ color: "var(--warning)" }} />
            : <XCircle className="w-5 h-5" style={{ color: "var(--negative)" }} />;
          return (
            <div key={s.name} className="card flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--paper)" }}
              >
                <Database className="w-4 h-4" style={{ color: "var(--ink-muted)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {icon}
                  <h3 className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                    {s.name}
                  </h3>
                </div>
                <p className="text-[12px] mt-1" style={{ color: "var(--ink-soft)" }}>
                  {s.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
