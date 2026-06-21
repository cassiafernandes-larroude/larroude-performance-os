// Cassia 2026-06-21: gera o preview da campanha (histórico + Gemini). Não escreve nada no Klaviyo.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hasGeminiCredentials } from '@/lib/gemini/client';
import { generateCampaign } from '@/lib/klaviyo/generator/generate';
import type { GeneratorInput } from '@/types/klaviyo/generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  market: z.enum(['US', 'BR']),
  type: z.enum(['MARKDOWN', 'FLASH', 'PREORDER', 'FULLPRICE', 'VIP', 'OTHER']),
  objective: z.string().min(3),
  destinationUrl: z.string().url(),
  creatives: z
    .array(
      z.object({
        imageUrl: z.string().url(),
        altText: z.string().optional(),
        caption: z.string().optional(),
      })
    )
    .default([]),
  offer: z.string().optional(),
  productName: z.string().optional(),
  revenueGoal: z.number().positive().optional(),
  period: z.enum(['L7D', 'L28D', '3M', '6M', '12M']).optional(),
});

export async function POST(req: NextRequest) {
  if (!hasGeminiCredentials()) {
    return NextResponse.json({ error: 'Vertex AI (Gemini) não configurado: defina GCP_SA_KEY_BASE64.' }, { status: 503 });
  }
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input inválido', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const { campaign, context } = await generateCampaign(parsed.data as GeneratorInput);
    return NextResponse.json({ campaign, context });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
