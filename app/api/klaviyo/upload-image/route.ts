// Cassia 2026-06-21: recebe o arquivo de imagem do gerador e hospeda no Klaviyo, devolvendo a URL.
import { NextRequest, NextResponse } from 'next/server';
import { uploadImageToKlaviyo } from '@/lib/klaviyo/generator/images';
import type { Market } from '@/types/klaviyo/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const market = (String(form.get('market') || 'US').toUpperCase()) as Market;
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Arquivo ausente.' }, { status: 400 });
    }
    const filename = (file as File).name || 'upload';
    const url = await uploadImageToKlaviyo(market, file, filename);
    return NextResponse.json({ url });
  } catch (e) {
    const msg = (e as Error).message;
    const status = /403|forbidden|scope/i.test(msg) ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
