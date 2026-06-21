# Voz da Larroudé — CRM / E-mail

> Fonte da verdade em código: [`lib/klaviyo/generator/brand-voice.ts`](../lib/klaviyo/generator/brand-voice.ts) (`LARROUDE_VOICE`).
> O Gerador de Campanhas Klaviyo importa esse arquivo — **editar lá atualiza a geração em todo lugar**.
> Além deste guia estável, o gerador **aprende ao vivo** o estilo real de cada conta a cada execução:
> estuda os **assuntos vencedores** (maior open rate / RPR) e o **copy do último e-mail do tipo**.

_Base da análise: ~200 campanhas mais recentes (abr–jun 2026, envio quase diário US + BR). Registrado em 2026-06-21._

## Regras do gerador (disclaimer)
- **Idioma por mercado:** US → inglês; BR → português (automático, sempre).
- **Voz:** aprendida do histórico real + tom por tipo de campanha (sem caixa de tom manual).
- **Análise:** ~12 meses de campanhas da conta, não só recentes.
- **Template:** duplica o último e-mail do mesmo tipo; troca só imagem, copy e links.
- **Nome:** convenção `AAAAMMDD_PREFIXO_Descrição` (FP/MD/PO/CS).
- **Segmentação por meta:** melhor combinação por RPR × alcance, com **exclusões** e **anti-overlap** (suprime impactados nos últimos 3 dias).
- **Saída:** sempre **rascunho** no Klaviyo — nunca envia.

## Posicionamento
Calçados **premium, fashion/editorial e jet-set**. Estética aspiracional de viagem/lifestyle (Milan, Cannes, Hamptons, La Dolce Vita), red carpet e momentos culturais (MET Gala, Coachella). Produto como objeto de desejo; a comunidade é protagonista.

## Personalidade
- Confiante, aspiracional e **descolada** — calorosa, com humor leve. Nunca arrogante/corporativa.
- **Elegante e enxuta**: frases curtas, ritmo limpo, desejo e benefício. Emoji raro (máx. 1).
- Lidera pelo **nome do modelo/estilista** (Fiore, Stella, Vivi, Biarritz, Loulou, Dolly, Freya, Valerie; collabs: Kenneth Cole, Jonathan Cohen, Tanner Fletcher, Markarian, Ciao Lucia).
- Comunidade feminina, com ângulo **unissex** quando cabe ("Larrougirls", "Hot Girls/Guys").

## Mecânicas recorrentes (reais na conta)
- **Sale = franquia "Weekend Rush"**, geralmente com tema (Milan, Raffia) e **escada de urgência**:
  Announcement → VIP/Early Access → Team Picks / La Dolce Vita → 48h/36h/24h/Hours Left → Final Hours / Last Call / Ends Tomorrow → "Missed it?" / Abandoned Carts (resend).
- **VIP early access** antes da sale pública ("VIP Early Access", "Extra 20 for VIPs").
- **Códigos promo nomeados** (LOVE20, LOVE15, SORRY10) e desconto explícito ("Up to 70% Off", "30+10off").
- **FP / lançamento:** "New Arrivals", "Drop", "Back in Stock", "Best Sellers" + editoriais/guias (Travel Guide, Wedding Guest Edit, Gift Guide, Dressing Guide, "Shop by size/color/price").
- **Momentos culturais/sazonais:** MET Gala, Coachella, Cannes, Earth Day, Mother's/Father's Day, Bridal.
- **CS/ops:** Delays por quinzena, sizing errors, cancelamentos, recovery; assume o erro com transparência (estilo "Sorry"/errata/recovery). **No BR, em português** ("Cancelamentos", "envio").
- Eles **testam variações** de assunto/ângulo (AltA, Test).

## Tom por tipo de campanha (decidido automaticamente)
| Tipo | Tom |
|---|---|
| **FULLPRICE / editorial** | Aspiracional e sofisticado; novidade, collab e desejo. Pouca menção a preço. |
| **MARKDOWN (sale)** | Valor e oferta **com elegância** — desconto sem soar "barato". |
| **FLASH** | Urgência genuína (tempo/escassez), direto e enérgico, sem perder o requinte. |
| **PREORDER** | Antecipação e exclusividade ("seja a primeira", "Last Chance to Pre-Order"). |
| **VIP** | Exclusividade e reconhecimento ("para você, que é da casa"). |
| **OUTROS / CS** | Claro, humano e transparente; assume o erro e tranquiliza. |

## Faça
- Liderar pelo produto/ocasião; **CTA único e claro**.
- Refletir estação/collab/lançamento atual; usar o **nome do modelo** quando houver.
- Ancorar nos **assuntos reais de melhor open rate e RPR** do mesmo tipo.

## Evite
- Clichês genéricos ("Não perca!", "Imperdível", CAPS gritando); excesso de emoji/exclamação.
- Preços, cupons ou claims não fornecidos; tom datado, impessoal ou jargão corporativo.

## Convenção de nome (Klaviyo)
`AAAAMMDD_<TIPO>_<Descrição>` — prefixos reais: `FP_` (Full Price), `MD_` (Markdown), `PO_` (Pre-Order), `CS_` (Customer Service). Modificadores: `[Follow-up]`, `RESEND_`, `(clone)`, `ERRATA`. VIP e FLASH normalmente entram como `MD_` (ex.: `MD_VIP50EarlyAccess`, `MD_WeekendRush24hLeft`).
