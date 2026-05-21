import { BigQuery } from "@google-cloud/bigquery";

let _client: BigQuery | null = null;
let _initError: string | null = null;

export function getBigQueryClient(): BigQuery | null {
  if (_client) return _client;
  if (_initError) return null;

  try {
    const projectId = process.env.GCP_PROJECT_ID || "larroude-data-platform";
    const keyBase64 = process.env.GCP_SA_KEY_BASE64;

    if (!keyBase64) {
      _initError = "GCP_SA_KEY_BASE64 not set";
      return null;
    }

    const credentials = JSON.parse(
      Buffer.from(keyBase64, "base64").toString("utf-8")
    );

    _client = new BigQuery({ projectId, credentials });
    return _client;
  } catch (err) {
    _initError = String(err);
    return null;
  }
}

export function hasBigQueryCredentials(): boolean {
  return !!process.env.GCP_SA_KEY_BASE64;
}

export async function runQuery<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const client = getBigQueryClient();
  if (!client) throw new Error("BigQuery client not initialized: " + _initError);

  const [job] = await client.createQueryJob({
    query: sql,
    params,
    location: "US",
  });
  const [rows] = await job.getQueryResults();
  return rows as T[];
}
