# Alexa → Larroudé Performance OS

Skill de voz privada que responde métricas ("Alexa, pergunte à Larroudé qual o faturamento de hoje no US").

## Arquitetura

```
Voz → Echo/app Alexa → Amazon (voz→texto)
  → POST https://larroude-performance-os.vercel.app/api/alexa
     → caminho rápido: getMetricBundle(market,"today")  [<2s, faturamento/pedidos/spend/CAC]
     → fallback: Claude + tools (mesmo do /api/chat)     [perguntas abertas]
  → texto → Amazon (texto→voz) → Alexa fala
```

Código: `app/api/alexa/route.ts` (handler) + `lib/alexa/verify.ts` (assinatura Amazon).

## 1. Variável de ambiente (Vercel)

Depois de criar a skill (passo 2), copie o **Skill ID** e adicione no projeto Vercel:

```
ALEXA_SKILL_ID = amzn1.ask.skill.xxxxxxxx-....
```

(Opcional mas recomendado — trava o endpoint pra só essa skill. Sem ela o endpoint aceita qualquer skill, protegido só pela assinatura da Amazon.)

## 2. Criar a skill (developer.amazon.com/alexa/console/ask → Create Skill)

- **Nome**: Larroudé · **Locale primário**: Português (BR)
- **Model**: Custom · **Hosting**: Provision your own
- **Invocation name**: `larroudé` (o que você fala depois de "Alexa, pergunte à…")
- **Endpoint** → HTTPS → `https://larroude-performance-os.vercel.app/api/alexa`
  - Certificado: "My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority" (Vercel).

### Interaction Model (aba JSON Editor → cole isto)

```json
{
  "interactionModel": {
    "languageModel": {
      "invocationName": "larroudé",
      "intents": [
        { "name": "AMAZON.StopIntent", "samples": [] },
        { "name": "AMAZON.CancelIntent", "samples": [] },
        { "name": "AMAZON.HelpIntent", "samples": [] },
        {
          "name": "PerguntarIntent",
          "slots": [
            { "name": "pergunta", "type": "AMAZON.SearchQuery" }
          ],
          "samples": [
            "qual {pergunta}",
            "quanto {pergunta}",
            "me diz {pergunta}",
            "sobre {pergunta}",
            "o {pergunta}"
          ]
        }
      ],
      "types": []
    }
  }
}
```

> `AMAZON.SearchQuery` captura a frase inteira como texto livre — é o que deixa o Claude
> interpretar qualquer pergunta. Ele exige uma "carrier phrase" (por isso `qual {pergunta}`
> em vez de só `{pergunta}`).

Salve (**Save Model**) e **Build Model**.

## 3. Testar

- Aba **Test** → ligue "Development".
- Digite/fale: *"pergunte à larroudé qual o faturamento de hoje no US"*.
- Em qualquer Echo logado na **sua** conta Amazon a skill já funciona (não precisa publicar).

## 4. Como fala

- **Caminho rápido** (palavras-chave detectadas em `route.ts`): faturamento/vendas/receita,
  gross, pedidos, investimento/spend, CAC, ROAS, ticket/AOV, unidades — + mercado (US/Brasil).
  Ex.: *"Faturamento de hoje no US: 42 mil dólares, 12 por cento acima do período anterior."*
- **Fallback Claude**: qualquer outra pergunta (comparações, "o que está errado", etc). Mais
  lento — pode chegar perto do limite de ~8s da Alexa em perguntas pesadas.

## Segurança (nível atual: skill privada)

- Não publicar na loja → só funciona nos Echos da sua conta.
- Assinatura da Amazon verificada em todo request (`lib/alexa/verify.ts`).
- `ALEXA_SKILL_ID` trava por applicationId.
- ⚠️ Quem estiver perto do aparelho ouve os números. Pra blindar mais: PIN falado ou account linking.

## Limitações conhecidas

- Alexa espera resposta em ~8s. O caminho rápido resolve isso pras perguntas comuns; o
  fallback do Claude tem `MAX_ITERATIONS=3` e `max_tokens=512` pra caber no tempo.
- Só "hoje" é o gatilho principal por voz (getMetricBundle aceita outros períodos se quiser expandir os utterances/slots).
