import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 para S3 e compatíveis (R2, MinIO), sem SDK.
 * Puro: recebe tudo por parâmetro, inclusive a data — testado em
 * tests/sigv4.test.ts contra o exemplo oficial da AWS.
 *
 * Referência: https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 */

export type SignInput = {
  method: string;
  /** Caminho já codificado (cada segmento com encodeURIComponent-like S3). */
  path: string;
  /** Query string canônica já codificada, ou "" */
  query?: string;
  headers: Record<string, string>;
  /** sha256 hex do corpo (ou "UNSIGNED-PAYLOAD"). */
  payloadHash: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Data no formato AMZ: 20130524T000000Z */
  amzDate: string;
};

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** S3 codifica cada segmento do caminho; "/" fica, "~" e "-_." ficam. */
export function encodeS3Path(path: string): string {
  return path
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

export function amzDateNow(d = new Date()): string {
  return d.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export function signV4(input: SignInput): { authorization: string; signedHeaders: string } {
  const service = input.service ?? "s3";
  const dateStamp = input.amzDate.slice(0, 8);

  // Cabeçalhos canônicos: minúsculos, ordenados, valores com espaços colapsados.
  const canonicalHeaders = Object.entries(input.headers)
    .map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const signedHeaders = canonicalHeaders.map(([k]) => k).join(";");
  const canonicalHeadersStr = canonicalHeaders.map(([k, v]) => `${k}:${v}\n`).join("");

  const canonicalRequest = [input.method, input.path, input.query ?? "", canonicalHeadersStr, signedHeaders, input.payloadHash].join("\n");

  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    signedHeaders,
  };
}
