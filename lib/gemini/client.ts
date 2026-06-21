// Cassia 2026-06-21: cliente Gemini via Google AI Studio (API generativelanguage) — só precisa de GEMINI_API_KEY.
// NÃO usa Vertex AI / IAM / service account. Chave gratuita em https://aistudio.google.com/apikey
import { GoogleGenerativeAI } from '@google/generative-ai';

let _client: GoogleGenerativeAI | null = null;

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export function hasGeminiCredentials(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
}

function getClient(): GoogleGenerativeAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

// Gera saída estruturada (JSON) garantida via responseSchema do Gemini.
export async function generateStructured<T = any>(opts: {
  system: string;
  user: string;
  schema: unknown;
  maxOutputTokens?: number;
}): Promise<T> {
  const client = getClient();
  if (!client) throw new Error('GEMINI_API_KEY não configurada (gere uma em https://aistudio.google.com/apikey).');

  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: opts.system,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: opts.maxOutputTokens || 16384,
      responseMimeType: 'application/json',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseSchema: opts.schema as any,
    },
  });

  const result = await model.generateContent(opts.user);
  const text = result.response.text();
  if (!text) throw new Error('Gemini retornou resposta vazia.');

  try {
    return JSON.parse(text) as T;
  } catch {
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned) as T;
  }
}
