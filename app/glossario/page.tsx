export default function GlossarioPage() {
  const kpis = [
    { sigla: "CAC", nome: "Customer Acquisition Cost", formula: "total_marketing_spend / new_customers", notas: "Inclui todos os canais pagos" },
    { sigla: "nCAC", nome: "New Customer Acquisition Cost", formula: "paid_ads_spend / new_customers_from_paid", notas: "Só tráfego pago atribuído" },
    { sigla: "CRC", nome: "Customer Retention Cost", formula: "(Klaviyo + Meta retargeting) / retained_customers", notas: "Cliente que comprou ≥ 2×" },
    { sigla: "LTV", nome: "Customer Lifetime Value", formula: "Receita acumulada média por cliente, janela 12m", notas: "—" },
    { sigla: "LTV:CAC", nome: "Razão de eficiência", formula: "LTV / CAC", notas: "Saudável ≥ 3:1" },
    { sigla: "ROAS", nome: "Return on Ad Spend", formula: "revenue / spend", notas: "Pode ser gross ou order" },
    { sigla: "AOV", nome: "Average Order Value", formula: "revenue / orders", notas: "—" },
    { sigla: "CVR", nome: "Conversion Rate", formula: "purchases / sessions", notas: "—" },
    { sigla: "CTR", nome: "Click-Through Rate", formula: "clicks / impressions", notas: "Meta / Google" },
    { sigla: "CPO", nome: "Cost Per Order", formula: "spend / orders", notas: "—" },
    { sigla: "CPA", nome: "Cost Per Acquisition", formula: "spend / conversions (pixel)", notas: "Atribuição Meta" },
  ];

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-[1500px] mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-[26px] lg:text-[36px]" style={{ color: "var(--ink)" }}>
          Glossário de KPIs
        </h1>
        <p className="text-[12px] lg:text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
          Definições canônicas usadas em todos os dashboards
        </p>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left py-2.5 pr-4 font-semibold label-meta">SIGLA</th>
                <th className="text-left py-2.5 pr-4 font-semibold label-meta">NOME</th>
                <th className="text-left py-2.5 pr-4 font-semibold label-meta">FÓRMULA</th>
                <th className="text-left py-2.5 font-semibold label-meta">NOTAS</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr
                  key={k.sigla}
                  style={{ borderBottom: "1px solid var(--border-soft)" }}
                >
                  <td className="py-3 pr-4 font-semibold" style={{ color: "var(--ink)" }}>
                    {k.sigla}
                  </td>
                  <td className="py-3 pr-4" style={{ color: "var(--ink-soft)" }}>
                    {k.nome}
                  </td>
                  <td className="py-3 pr-4 font-num text-[12px]" style={{ color: "var(--ink-muted)" }}>
                    {k.formula}
                  </td>
                  <td className="py-3 text-[12px]" style={{ color: "var(--ink-muted)" }}>
                    {k.notas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
