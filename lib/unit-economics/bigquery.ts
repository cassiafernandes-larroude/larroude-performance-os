// BigQuery client para Unit Economics — reusa o mesmo padrão do LTV/CAC.
import { BigQuery } from '@google-cloud/bigquery';

let cachedClient: BigQuery | null = null;

export function getBigQuery(): BigQuery {
  if (cachedClient) return cachedClient;
  const projectId = process.env.BIGQUERY_PROJECT_ID || process.env.GCP_PROJECT_ID || 'larroude-data-prod';
  const jsonRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GCP_SERVICE_ACCOUNT_JSON;
  const b64 = process.env.GCP_SA_KEY_BASE64;
  let credentials: any | undefined;
  if (jsonRaw) {
    try { credentials = JSON.parse(jsonRaw); } catch { throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON invalid JSON'); }
  } else if (b64) {
    try { credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')); } catch { throw new Error('GCP_SA_KEY_BASE64 invalid'); }
  }
  if (credentials) {
    cachedClient = new BigQuery({ projectId, credentials: { client_email: credentials.client_email, private_key: credentials.private_key } });
  } else {
    cachedClient = new BigQuery({ projectId });
  }
  return cachedClient;
}

export async function runQuery<T = Record<string, unknown>>(query: string, params?: Record<string, unknown>): Promise<T[]> {
  const bq = getBigQuery();
  const [rows] = await bq.query({ query, params, location: 'US' });
  return rows as T[];
}
