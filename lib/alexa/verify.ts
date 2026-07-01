import crypto from "crypto";

// Cassia 2026-07-01: verificacao de request da Alexa (Amazon assina cada chamada).
// Sem isto, o endpoint /api/alexa fica publico e qualquer um poderia POSTar pedindo
// faturamento. Segue os passos oficiais da Amazon (validar URL do cert -> baixar cert
// -> checar validade + SAN echo-api.amazon.com -> verificar assinatura RSA-SHA1 do body
// -> checar timestamp < 150s). Referencia: developer.amazon.com "Manually verify request".

const CERT_CACHE = new Map<string, crypto.X509Certificate[]>();

function validCertUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.hostname.toLowerCase() !== "s3.amazonaws.com") return false;
    if (u.port && u.port !== "443") return false;
    // normaliza o path e exige prefixo /echo.api/
    const path = u.pathname.replace(/\/+/g, "/");
    return path.startsWith("/echo.api/");
  } catch {
    return false;
  }
}

async function loadCertChain(url: string): Promise<crypto.X509Certificate[]> {
  const cached = CERT_CACHE.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cert download failed: ${res.status}`);
  const pem = await res.text();
  // O arquivo traz a cadeia inteira concatenada; separa cada bloco PEM.
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!blocks || blocks.length === 0) throw new Error("no certs in chain");
  const chain = blocks.map((b) => new crypto.X509Certificate(b));
  CERT_CACHE.set(url, chain);
  return chain;
}

export type AlexaVerifyResult = { ok: true } | { ok: false; reason: string };

export async function verifyAlexaRequest(
  rawBody: string,
  signatureCertChainUrl: string | null,
  signature: string | null,
  requestTimestamp: string | null
): Promise<AlexaVerifyResult> {
  if (!signatureCertChainUrl || !signature) {
    return { ok: false, reason: "missing signature headers" };
  }
  if (!validCertUrl(signatureCertChainUrl)) {
    return { ok: false, reason: "invalid cert chain url" };
  }

  // Timestamp tolerance: rejeita replays / requests velhos (> 150s).
  if (requestTimestamp) {
    const ts = Date.parse(requestTimestamp);
    if (Number.isFinite(ts) && Math.abs(Date.now() - ts) > 150_000) {
      return { ok: false, reason: "stale timestamp" };
    }
  }

  let chain: crypto.X509Certificate[];
  try {
    chain = await loadCertChain(signatureCertChainUrl);
  } catch (e) {
    return { ok: false, reason: `cert load: ${(e as Error).message}` };
  }

  const leaf = chain[0];
  const now = new Date();
  if (new Date(leaf.validFrom) > now || new Date(leaf.validTo) < now) {
    return { ok: false, reason: "cert expired/not yet valid" };
  }
  // SAN precisa conter echo-api.amazon.com
  const san = leaf.subjectAltName || "";
  if (!san.split(/,\s*/).some((s) => s.trim().toLowerCase() === "dns:echo-api.amazon.com")) {
    return { ok: false, reason: "cert SAN mismatch" };
  }

  // Verifica a assinatura RSA-SHA1 do corpo bruto contra a chave publica do leaf cert.
  const verifier = crypto.createVerify("RSA-SHA1");
  verifier.update(rawBody);
  const valid = verifier.verify(leaf.publicKey, signature, "base64");
  if (!valid) return { ok: false, reason: "signature mismatch" };

  return { ok: true };
}
