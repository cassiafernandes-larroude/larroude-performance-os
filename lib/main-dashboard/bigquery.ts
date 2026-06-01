// BigQuery client com suporte a service account via:
//   - GCP_SERVICE_ACCOUNT_JSON (JSON inline - usado pelo Dashboard Geral original)
//   - GCP_SA_KEY_BASE64 (base64 do JSON - usado pelo lpos)
//   - GOOGLE_APPLICATION_CREDENTIALS (dev local)

import { BigQuery } from '@google-cloud/bigquery';

let _client: BigQuery | null = null;

export function getBQ(): BigQuery {
  if (_client) return _client;

  const projectId = process.env.GCP_PROJECT_ID || 'larroude-data-prod';
  const saJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
  const saB64 = process.env.GCP_SA_KEY_BASE64;

  let credentials: any | undefined;

  if (saJson) {
    try {
      credentials = JSON.parse(saJson);
    } catch (e) {
      throw new Error('GCP_SERVICE_ACCOUNT_JSON invalid (not parseable JSON)');
    }
  } else if (saB64) {
    try {
      credentials = JSON.parse(Buffer.from(saB64, 'base64').toString('utf-8'));
    } catch (e) {
      throw new Error('GCP_SA_KEY_BASE64 invalid (cannot decode/parse)');
    }
  }

  if (credentials) {
    _client = new BigQuery({ projectId, credentials });
  } else {
    // Dev local usa GOOGLE_APPLICATION_CREDENTIALS automaticamente
    _client = new BigQuery({ projectId });
  }
  return _client;
}

export async function runQuery<T = any>(query: string, params?: Record<string, any>): Promise<T[]> {
  const bq = getBQ();
  const [job] = await bq.createQueryJob({
    query,
    params,
    location: 'US',
    useLegacySql: false,
  });
  const [rows] = await job.getQueryResults();
  return rows as T[];
}
