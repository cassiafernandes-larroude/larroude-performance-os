// Cassia 2026-06-21: cliente Vertex AI (Gemini) reaproveitando as credenciais GCP do BigQuery.
// Não precisa de chave nova — usa GCP_SA_KEY_BASE64 (mesma do lib/bigquery/client.ts).
// Pré-requisito no GCP: API "Vertex AI" habilitada + a service account com role "Vertex AI User" (roles/aiplatform.user).
import { VertexAI } from '@google-cloud/vertexai';

let _vertex: VertexAI | null = null;
let _initError: string | null = null;

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const VERTEX_LOCATION = process.env.GCP_VERTEX_LOCATION || 'us-central1';

export function hasGeminiCredentials(): boolean {
  return !!process.env.GCP_SA_KEY_BASE64;
}

function getVertex(): VertexAI | null {
  if (_vertex) return _vertex;
  if (_initError) return null;
  try {
    const keyBase64 = process.env.GCP_SA_KEY_BASE64;
    if (!keyBase64) {
      _initError = 'GCP_SA_KEY_BASE64 não configurada';
      return null;
    }
    const credentials = JSON.parse(Buffer.from(keyBase64, 'base64').toString('utf-8'));
    const project =
      process.env.GCP_VERTEX_PROJECT_ID ||
      process.env.GCP_PROJECT_ID ||
      credentials.project_id ||
      'larroude-data-platform';
    _vertex = new VertexAI({ project, location: VERTEX_LOCATION, googleAuthOptions: { credentials } });
    return _vertex;
  } catch (err) {
    _initError = String(err);
    return null;
  }
}

// Gera saída estruturada (JSON) garantida via responseSchema do Gemini.
export async function generateStructured<T = any>(opts: {
  system: string;
  user: string;
  schema: unknown;
  maxOutputTokens?: number;
}): Promise<T> {
  const vertex = getVertex();
  if (!vertex) throw new Error('Vertex AI não configurado: ' + (_initError || 'sem credenciais GCP'));

  const model = vertex.getGenerativeModel({
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

  const resp = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: opts.user }] }],
  });

  const text =
    resp.response?.candidates?.[0]?.content?.parts?.map((p) => ('text' in p ? p.text : '')).join('') || '';
  if (!text) throw new Error('Gemini retornou resposta vazia.');

  try {
    return JSON.parse(text) as T;
  } catch {
    // Gemini às vezes embrulha em ```json … ``` — limpa e tenta de novo.
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned) as T;
  }
}
