"use client";

// Cassia 2026-06-20: UI do Gerador de Campanhas Klaviyo (form → preview → criar rascunho).
import { useState } from "react";
import { Sparkles, Plus, Trash2, Loader2, ExternalLink, Check, AlertTriangle } from "lucide-react";
import type {
  CampaignType,
  CreativeInput,
  GeneratedCampaign,
  PerformanceContext,
} from "@/types/klaviyo/generator";

type Market = "US" | "BR";

// Os 6 tipos do dashboard (classifyCampaign).
const TYPES: { value: CampaignType; label: string }[] = [
  { value: "FULLPRICE", label: "Full Price" },
  { value: "MARKDOWN", label: "Markdown / Sale" },
  { value: "PREORDER", label: "Pre-Order" },
  { value: "FLASH", label: "Flash" },
  { value: "VIP", label: "VIP" },
  { value: "OTHER", label: "Outros" },
];

export default function CampaignGenerator({ initialMarket = "US" }: { initialMarket?: Market } = {}) {
  const [market, setMarket] = useState<Market>(initialMarket);
  const [type, setType] = useState<CampaignType>("FULLPRICE");
  const [objective, setObjective] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [offer, setOffer] = useState("");
  const [productName, setProductName] = useState("");
  const [revenueGoal, setRevenueGoal] = useState("");
  const [creatives, setCreatives] = useState<CreativeInput[]>([{ imageUrl: "", altText: "", caption: "" }]);

  const currency = market === "BR" ? "R$" : "$";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<GeneratedCampaign | null>(null);
  const [context, setContext] = useState<PerformanceContext | null>(null);
  const [selectedSubject, setSelectedSubject] = useState(0);

  const [creating, setCreating] = useState(false);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  // Cassia 2026-06-21: guarda o payload da geração p/ permitir re-tentar só a etapa 2 (template).
  const [lastPayload, setLastPayload] = useState<ReturnType<typeof genPayload> | null>(null);

  // Cassia 2026-06-21: aceita link sem protocolo (ex.: "www.larroude.com") — a validacao .url() do backend
  // exige http(s). Prepende https:// quando falta, p/ nao dar "Input invalido".
  function normalizeUrl(u: string): string {
    const t = u.trim();
    if (!t) return t;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  }

  function genPayload() {
    return {
      market,
      type,
      objective,
      destinationUrl: normalizeUrl(destinationUrl),
      offer: offer || undefined,
      productName: productName || undefined,
      revenueGoal: revenueGoal ? Number(revenueGoal.replace(/[^\d]/g, "")) || undefined : undefined,
      creatives: creatives
        .filter((c) => c.imageUrl.trim())
        .map((c) => ({ ...c, imageUrl: normalizeUrl(c.imageUrl) })),
    };
  }

  async function fetchTemplate(payload: ReturnType<typeof genPayload>) {
    setTemplateLoading(true);
    setTemplateError(null);
    try {
      const res = await fetch("/api/klaviyo/generate-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar o template.");
      setCampaign((prev) => (prev ? { ...prev, html: data.html } : prev));
    } catch (e) {
      setTemplateError((e as Error).message);
    } finally {
      setTemplateLoading(false);
    }
  }

  function updateCreative(i: number, patch: Partial<CreativeInput>) {
    setCreatives((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  async function handleFile(i: number, file?: File) {
    if (!file) return;
    setUploadingIdx(i);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("market", market);
      const res = await fetch("/api/klaviyo/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no upload da imagem.");
      updateCreative(i, { imageUrl: data.url, altText: file.name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingIdx(null);
    }
  }

  async function handleGenerate() {
    setError(null);
    setCampaign(null);
    setDraftUrl(null);
    setDraftError(null);
    setTemplateError(null);
    if (!objective.trim() || !destinationUrl.trim()) {
      setError("Preencha o objetivo e o link de destino.");
      return;
    }
    setLoading(true);
    try {
      const payload = genPayload();
      setLastPayload(payload);
      const res = await fetch("/api/klaviyo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // Detalha qual campo falhou na validacao, em vez do generico "Input invalido".
        const fieldErrs = data?.details?.fieldErrors as Record<string, string[]> | undefined;
        const detail = fieldErrs
          ? Object.entries(fieldErrs)
              .map(([k, v]) => `${k}: ${v.join(", ")}`)
              .join(" · ")
          : "";
        throw new Error([data.error || "Erro ao gerar campanha.", detail].filter(Boolean).join(" — "));
      }
      setCampaign(data.campaign);
      setContext(data.context);
      setSelectedSubject(0);
      // Etapa 2: o template (HTML) é gerado em paralelo, sem travar o preview dos assuntos.
      void fetchTemplate(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDraft() {
    if (!campaign || !campaign.html) return;
    setCreating(true);
    setDraftError(null);
    setDraftUrl(null);
    try {
      const subj = campaign.subjects[selectedSubject];
      const res = await fetch("/api/klaviyo/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          campaignName: campaign.campaignNameSuggestion,
          subject: subj.subject,
          previewText: subj.previewText,
          segmentIds: campaign.segments.map((s) => s.id),
          excludedSegmentIds: campaign.excludedSegments.map((s) => s.id),
          html: campaign.html,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403)
          throw new Error(
            "A chave do Klaviyo não tem permissão de escrita (campaigns:write / templates:write). " +
              "Gere uma Private API Key com esses escopos. " +
              (data.error || "")
          );
        throw new Error(data.error || "Erro ao criar rascunho.");
      }
      setDraftUrl(data.campaignUrl);
    } catch (e) {
      setDraftError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ background: "var(--pink, #e8508d)" }}>
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--ink, #1a1a1a)" }}>
            Gerador de Campanhas Klaviyo
          </h1>
          <p className="text-sm" style={{ color: "var(--ink-muted, #888)" }}>
            Tipo + objetivo + criativos (e meta de faturamento) → assunto, copy na voz da Larroudé, segmentação e template, calibrados pela performance histórica
          </p>
        </div>
      </header>

      {/* Disclaimer — regras do gerador (recolhível) */}
      <details
        className="mb-6 rounded-lg text-xs"
        style={{ background: "var(--paper-deep, #f7f4f1)", border: "1px solid var(--border, #eee)", color: "var(--ink-soft, #555)" }}
      >
        <summary
          className="cursor-pointer select-none px-3 py-2 font-medium"
          style={{ color: "var(--ink, #1a1a1a)" }}
        >
          ℹ️ Como o gerador funciona (regras)
        </summary>
        <ul className="space-y-1 list-disc pl-7 pr-3 pb-3">
          <li><strong>Idioma por mercado:</strong> US → inglês; BR → português (automático, sempre).</li>
          <li><strong>Voz da Larroudé:</strong> aprendida do histórico real da conta (assuntos e copies vencedores) + tom por tipo.</li>
          <li><strong>Análise:</strong> ~12 meses de campanhas da conta, não só recentes.</li>
          <li><strong>Template:</strong> duplica o último e-mail do mesmo tipo e troca apenas imagem, copy e links.</li>
          <li><strong>Nome:</strong> convenção <code>AAAAMMDD_PREFIXO_Descrição</code> (FP/MD/PO/CS).</li>
          <li><strong>Segmentação por meta:</strong> melhor combinação por RPR × alcance, com <strong>exclusões</strong> e <strong>anti-overlap</strong> (suprime impactados nos últimos 3 dias).</li>
          <li><strong>Saída:</strong> sempre <strong>rascunho</strong> no Klaviyo — nunca envia.</li>
        </ul>
      </details>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ---------------- FORM ---------------- */}
        <section className="space-y-4 rounded-xl p-5" style={{ border: "1px solid var(--border, #eee)" }}>
          <div className="flex gap-2">
            {(["US", "BR"] as Market[]).map((m) => (
              <button
                key={m}
                onClick={() => setMarket(m)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium"
                style={{
                  background: market === m ? "var(--ink, #1a1a1a)" : "transparent",
                  color: market === m ? "#fff" : "var(--ink, #1a1a1a)",
                  border: "1px solid var(--border, #ddd)",
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <Field label="Tipo de campanha (convenção Klaviyo)">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: type === t.value ? "var(--pink, #e8508d)" : "transparent",
                    color: type === t.value ? "#fff" : "var(--ink-soft, #555)",
                    border: "1px solid var(--border, #ddd)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Objetivo / briefing *">
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="Ex.: Lançar a nova bota de cano alto coleção inverno, foco em clientes que já compraram botas."
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ border: "1px solid var(--border, #ddd)", background: "var(--paper, #fff)" }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Link de destino (CTA) *">
              <input
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://larroude.com/..."
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: "1px solid var(--border, #ddd)" }}
              />
            </Field>
            <Field label="Oferta (opcional)">
              <input
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="20% OFF, frete grátis…"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: "1px solid var(--border, #ddd)" }}
              />
            </Field>
            <Field label="Produto/coleção (opcional)">
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: "1px solid var(--border, #ddd)" }}
              />
            </Field>
            <Field label={`Meta de faturamento (${currency}) — opcional`}>
              <input
                value={revenueGoal}
                onChange={(e) => setRevenueGoal(e.target.value)}
                inputMode="numeric"
                placeholder="ex.: 50000"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ border: "1px solid var(--border, #ddd)" }}
              />
            </Field>
          </div>

          <Field label="Criativos (carregue a imagem ou cole a URL)">
            <div className="space-y-3">
              {creatives.map((c, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      {c.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.imageUrl}
                          alt=""
                          className="w-12 h-12 rounded object-cover flex-shrink-0"
                          style={{ border: "1px solid var(--border, #eee)" }}
                        />
                      ) : null}
                      <label
                        className="cursor-pointer text-xs font-medium px-3 py-2 rounded-lg whitespace-nowrap"
                        style={{ border: "1px solid var(--border, #ddd)", color: "var(--ink, #1a1a1a)", opacity: uploadingIdx === i ? 0.6 : 1 }}
                      >
                        {uploadingIdx === i ? "Enviando…" : c.imageUrl ? "Trocar imagem" : "Carregar imagem"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingIdx === i}
                          onChange={(e) => handleFile(i, e.target.files?.[0])}
                        />
                      </label>
                      <span className="text-[11px]" style={{ color: "var(--ink-muted, #999)" }}>ou cole a URL ↓</span>
                    </div>
                    <input
                      value={c.imageUrl}
                      onChange={(e) => updateCreative(i, { imageUrl: e.target.value })}
                      placeholder="https://cdn.../imagem.jpg"
                      className="w-full rounded-lg px-3 py-2 text-sm"
                      style={{ border: "1px solid var(--border, #ddd)" }}
                    />
                    <input
                      value={c.caption || ""}
                      onChange={(e) => updateCreative(i, { caption: e.target.value })}
                      placeholder="legenda/copy opcional"
                      className="w-full rounded-lg px-3 py-1.5 text-xs"
                      style={{ border: "1px solid var(--border, #eee)" }}
                    />
                  </div>
                  <button
                    onClick={() => setCreatives((cs) => cs.filter((_, idx) => idx !== i))}
                    className="p-2 rounded-lg"
                    style={{ color: "var(--ink-muted, #999)" }}
                    aria-label="Remover criativo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setCreatives((cs) => [...cs, { imageUrl: "", altText: "", caption: "" }])}
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: "var(--pink, #e8508d)" }}
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar criativo
              </button>
            </div>
          </Field>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "var(--ink, #1a1a1a)", color: "#fff" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "Gerando…" : "Gerar campanha"}
          </button>

          {error && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: "#d33" }}>
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          )}
        </section>

        {/* ---------------- PREVIEW ---------------- */}
        <section className="space-y-4">
          {!campaign && (
            <div
              className="rounded-xl p-8 text-center text-sm"
              style={{ border: "1px dashed var(--border, #ddd)", color: "var(--ink-muted, #999)" }}
            >
              O preview da campanha aparece aqui depois de gerar.
            </div>
          )}

          {campaign && (
            <>
              {/* Assuntos */}
              <Card title="Assuntos">
                <div className="space-y-2">
                  {campaign.subjects.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedSubject(i)}
                      className="w-full text-left rounded-lg p-3"
                      style={{
                        border: `1px solid ${selectedSubject === i ? "var(--pink, #e8508d)" : "var(--border, #eee)"}`,
                        background: selectedSubject === i ? "rgba(232,80,141,0.05)" : "transparent",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {selectedSubject === i && <Check className="w-4 h-4" style={{ color: "var(--pink, #e8508d)" }} />}
                        <span className="font-medium text-sm" style={{ color: "var(--ink, #1a1a1a)" }}>
                          {s.subject}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: "var(--ink-muted, #888)" }}>
                        Preview: {s.previewText}
                      </p>
                      <p className="text-xs mt-1 italic" style={{ color: "var(--ink-muted, #aaa)" }}>
                        {s.rationale}
                      </p>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Plano de meta (quando há meta de faturamento) */}
              {campaign.goalPlan && (
                <Card title="Plano de meta">
                  <div
                    className="rounded-lg p-3 mb-2"
                    style={{
                      background: campaign.goalPlan.achievable ? "rgba(34,160,90,0.07)" : "rgba(211,51,51,0.06)",
                      border: `1px solid ${campaign.goalPlan.achievable ? "rgba(34,160,90,0.25)" : "rgba(211,51,51,0.25)"}`,
                    }}
                  >
                    <p className="text-sm font-medium" style={{ color: "var(--ink, #1a1a1a)" }}>
                      Meta: {currency} {campaign.goalPlan.goal.toLocaleString()} · Projeção:{" "}
                      <strong>{currency} {campaign.goalPlan.projectedRevenue.toLocaleString()}</strong>
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--ink-muted, #777)" }}>
                      {campaign.goalPlan.achievable
                        ? `✓ Meta atingível com ~${campaign.goalPlan.totalReach.toLocaleString()} destinatários.`
                        : `⚠ Faltam ${currency} ${campaign.goalPlan.gap.toLocaleString()} — amplie audiência/oferta.`}
                    </p>
                  </div>
                </Card>
              )}

              {/* Segmentação + horário */}
              <Card title="Segmentação & envio">
                <div className="space-y-2">
                  {campaign.segments.map((seg) => (
                    <div key={seg.id}>
                      <p className="text-sm font-medium" style={{ color: "var(--ink, #1a1a1a)" }}>
                        {seg.name}
                        {seg.estReach ? (
                          <span className="font-normal" style={{ color: "var(--ink-muted, #888)" }}>
                            {" "}· ~{seg.estReach.toLocaleString()} dest.
                            {seg.estRevenue ? ` · ${currency} ${seg.estRevenue.toLocaleString()}` : ""}
                          </span>
                        ) : null}
                      </p>
                      {seg.why && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--ink-muted, #888)" }}>
                          {seg.why}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-2 italic" style={{ color: "var(--ink-muted, #999)" }}>
                  {campaign.segmentationRationale}
                </p>
                {campaign.excludedSegments.length > 0 && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border, #eee)" }}>
                    <p className="text-xs font-medium mb-1" style={{ color: "var(--ink-soft, #555)" }}>
                      Exclusões ({context?.recentlyMailed?.days ?? 3}d) — anti-overlap/fadiga:
                    </p>
                    <p className="text-xs" style={{ color: "var(--ink-muted, #888)" }}>
                      {campaign.excludedSegments.map((s) => s.name).join(" · ")}
                    </p>
                  </div>
                )}
                <p className="text-[11px] mt-2" style={{ color: "var(--ink-muted, #aaa)" }}>
                  O Klaviyo deduplica destinatários entre audiências incluídas (sem e-mail duplicado).
                </p>
                <p className="text-sm mt-3" style={{ color: "var(--ink, #1a1a1a)" }}>
                  🕑 Melhor envio: <strong>{campaign.recommendedSendDay}</strong>
                </p>
                {context && (
                  <p className="text-xs mt-1" style={{ color: "var(--ink-muted, #aaa)" }}>
                    Base: {context.topCampaigns.length} campanhas · média da conta OR {context.accountAvgOpenRate}%
                  </p>
                )}
              </Card>

              {/* Estratégia */}
              <Card title="Estratégia">
                <p className="text-xs" style={{ color: "var(--ink-soft, #555)" }}>
                  {campaign.rationale}
                </p>
              </Card>

              {/* Preview HTML */}
              <Card title="Preview do template">
                <p className="text-xs mb-2" style={{ color: "var(--ink-muted, #888)" }}>
                  {context?.baseTemplate
                    ? `Duplicado de "${context.baseTemplate.campaignName}" (último ${context.focusTypeLabel} enviado em ${context.baseTemplate.sendDate}) — imagem e copy ajustadas.`
                    : `Sem e-mail anterior do tipo ${context?.focusTypeLabel ?? ""} — template criado do zero.`}
                </p>
                {campaign.html ? (
                  <iframe
                    title="preview"
                    sandbox=""
                    srcDoc={campaign.html}
                    className="w-full rounded-lg"
                    style={{ height: 480, border: "1px solid var(--border, #eee)", background: "#fff" }}
                  />
                ) : templateError ? (
                  <div className="flex flex-col items-start gap-2">
                    <p className="text-xs flex items-start gap-1.5" style={{ color: "#d33" }}>
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {templateError}
                    </p>
                    <button
                      type="button"
                      onClick={() => lastPayload && fetchTemplate(lastPayload)}
                      disabled={templateLoading || !lastPayload}
                      className="text-xs px-3 py-1.5 rounded-md border"
                      style={{ borderColor: "var(--border, #ddd)" }}
                    >
                      {templateLoading ? "Gerando…" : "Tentar gerar o template de novo"}
                    </button>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center gap-2 text-sm rounded-lg"
                    style={{ height: 200, border: "1px dashed var(--border, #ddd)", color: "var(--ink-muted, #999)" }}
                  >
                    <Loader2 className="w-4 h-4 animate-spin" /> Gerando template… (alguns segundos)
                  </div>
                )}
              </Card>

              {/* Criar rascunho */}
              <div className="rounded-xl p-4" style={{ border: "1px solid var(--border, #eee)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--ink-muted, #888)" }}>
                  Nome sugerido: <strong>{campaign.campaignNameSuggestion}</strong>. Cria template + campanha em
                  <strong> rascunho</strong> no Klaviyo (não envia).
                </p>
                <button
                  onClick={handleCreateDraft}
                  disabled={creating || !campaign.html}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: "var(--pink, #e8508d)", color: "#fff" }}
                >
                  {creating || templateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {creating ? "Criando rascunho…" : !campaign.html ? "Aguardando o template…" : "Criar rascunho no Klaviyo"}
                </button>
                {draftUrl && (
                  <a
                    href={draftUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium"
                    style={{ color: "var(--pink, #e8508d)" }}
                  >
                    Abrir rascunho no Klaviyo <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                {draftError && (
                  <p className="mt-3 text-xs flex items-start gap-1.5" style={{ color: "#d33" }}>
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {draftError}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1" style={{ color: "var(--ink-soft, #555)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ border: "1px solid var(--border, #eee)" }}>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--ink-muted, #999)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}
