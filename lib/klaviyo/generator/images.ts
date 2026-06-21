// Cassia 2026-06-21: upload de arquivo de imagem para o Klaviyo (CDN), retornando a URL hospedada.
// O e-mail precisa de uma URL pública; o Klaviyo Images API hospeda o arquivo enviado.
import { getApiKey } from '../klaviyo';
import type { Market } from '@/types/klaviyo/models';

const REVISION = process.env.KLAVIYO_REVISION || process.env.KLAVIYO_API_VERSION || '2024-10-15';

export async function uploadImageToKlaviyo(market: Market, file: Blob, filename: string): Promise<string> {
  const key = getApiKey(market);
  if (!key) throw new Error(`Klaviyo API key ausente para market=${market}`);

  const fd = new FormData();
  fd.append('file', file, filename || 'upload');

  // NÃO definir Content-Type manualmente: o fetch monta o boundary do multipart.
  const res = await fetch('https://a.klaviyo.com/api/image-upload/', {
    method: 'POST',
    headers: { Authorization: `Klaviyo-API-Key ${key}`, revision: REVISION },
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo image-upload ${res.status} :: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const url = json?.data?.attributes?.image_url;
  if (!url) throw new Error('Upload sem image_url na resposta do Klaviyo.');
  return url as string;
}
