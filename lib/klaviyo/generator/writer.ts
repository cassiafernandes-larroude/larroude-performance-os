// Cassia 2026-06-20: escrita no Klaviyo — cria template + campanha em DRAFT e associa o template.
// NUNCA cria campaign-send-job, portanto a campanha jamais é enviada por aqui.
import { klaviyoFetch } from '../klaviyo';
import type { Market } from '@/types/klaviyo/models';
import type { CreateDraftInput, CreateDraftResult } from '@/types/klaviyo/generator';

function fromEmail(market: Market): string | undefined {
  return market === 'BR'
    ? process.env.KLAVIYO_FROM_EMAIL_BR || process.env.KLAVIYO_FROM_EMAIL_US
    : process.env.KLAVIYO_FROM_EMAIL_US;
}
function fromLabel(market: Market): string | undefined {
  return market === 'BR'
    ? process.env.KLAVIYO_FROM_LABEL_BR || process.env.KLAVIYO_FROM_LABEL_US || 'Larroudé'
    : process.env.KLAVIYO_FROM_LABEL_US || 'Larroudé';
}

async function createTemplate(market: Market, name: string, html: string): Promise<string> {
  const resp: any = await klaviyoFetch({
    market,
    path: '/templates/',
    method: 'POST',
    body: { data: { type: 'template', attributes: { name, editor_type: 'CODE', html } } },
  });
  const id = resp?.data?.id;
  if (!id) throw new Error('Falha ao criar template (sem id na resposta).');
  return id;
}

async function createCampaignDraft(input: CreateDraftInput): Promise<string> {
  const content: Record<string, unknown> = {
    subject: input.subject,
    preview_text: input.previewText,
  };
  const fe = fromEmail(input.market);
  if (fe) content.from_email = fe;
  content.from_label = fromLabel(input.market);

  const resp: any = await klaviyoFetch({
    market: input.market,
    path: '/campaigns/',
    method: 'POST',
    body: {
      data: {
        type: 'campaign',
        attributes: {
          name: input.campaignName,
          audiences: { included: input.segmentIds, excluded: input.excludedSegmentIds || [] },
          'campaign-messages': {
            data: [
              {
                type: 'campaign-message',
                attributes: {
                  definition: {
                    channel: 'email',
                    label: input.campaignName,
                    content,
                  },
                },
              },
            ],
          },
        },
      },
    },
  });
  const id = resp?.data?.id;
  if (!id) throw new Error('Falha ao criar campanha (sem id na resposta).');
  return id;
}

async function getMessageId(market: Market, campaignId: string): Promise<string> {
  const resp: any = await klaviyoFetch({
    market,
    path: `/campaigns/${campaignId}/campaign-messages`,
    query: { 'fields[campaign-message]': 'label' },
  });
  const id = resp?.data?.[0]?.id;
  if (!id) throw new Error('Não foi possível obter o id da mensagem da campanha.');
  return id;
}

async function assignTemplate(market: Market, messageId: string, templateId: string): Promise<void> {
  await klaviyoFetch({
    market,
    path: '/campaign-message-assign-template/',
    method: 'POST',
    body: {
      data: {
        type: 'campaign-message',
        id: messageId,
        relationships: { template: { data: { type: 'template', id: templateId } } },
      },
    },
  });
}

export async function createDraft(input: CreateDraftInput): Promise<CreateDraftResult> {
  const templateId = await createTemplate(input.market, `${input.campaignName} — template`, input.html);
  const campaignId = await createCampaignDraft(input);
  const messageId = await getMessageId(input.market, campaignId);
  await assignTemplate(input.market, messageId, templateId);
  return {
    templateId,
    campaignId,
    messageId,
    campaignUrl: `https://www.klaviyo.com/campaign/${campaignId}/wizard`,
  };
}
