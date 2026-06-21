// Cassia 2026-06-20: cria o rascunho (template + campanha DRAFT) no Klaviyo a partir do payload aprovado.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createDraft } from '@/lib/klaviyo/generator/writer';
import type { CreateDraftInput } from '@/types/klaviyo/generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  market: z.enum(['US', 'BR']),
  campaignName: z.string().min(1),
  subject: z.string().min(1),
  previewText: z.string().default(''),
  segmentIds: z.array(z.string().min(1)).min(1),
  excludedSegmentIds: z.array(z.string().min(1)).default([]),
  html: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input inválido', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createDraft(parsed.data as CreateDraftInput);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    // Erro comum: chave sem escopo de escrita.
    const status = /403|forbidden|scope/i.test(msg) ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
