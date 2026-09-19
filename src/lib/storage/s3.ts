import "server-only";
import { fullKey, type PutInput, type StorageProvider } from "./provider";
import { amzDateNow, encodeS3Path, sha256Hex, signV4 } from "./sigv4";

/**
 * S3 e compatíveis (Cloudflare R2, MinIO, Backblaze). Sem SDK: PUT/DELETE
 * assinados com SigV4 via fetch.
 *
 * Env:
 *  S3_BUCKET, S3_REGION (R2: "auto"), S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
 *  S3_ENDPOINT      ex.: https://<account>.r2.cloudflarestorage.com (vazio = AWS)
 *  S3_PUBLIC_URL    base pública/CDN, ex.: https://cdn.heeca.com.br
 *  S3_FORCE_PATH_STYLE=true  para MinIO/R2 (bucket no caminho, não no host)
 */
export class S3StorageProvider implements StorageProvider {
  private readonly bucket = env("S3_BUCKET");
  private readonly region = process.env.S3_REGION ?? "us-east-1";
  private readonly accessKeyId = env("S3_ACCESS_KEY_ID");
  private readonly secretAccessKey = env("S3_SECRET_ACCESS_KEY");
  private readonly endpoint = (process.env.S3_ENDPOINT ?? `https://s3.${this.region}.amazonaws.com`).replace(/\/$/, "");
  private readonly pathStyle = process.env.S3_FORCE_PATH_STYLE === "true" || !!process.env.S3_ENDPOINT;
  private readonly publicUrl = (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "");

  private objectUrl(key: string): { url: URL; path: string } {
    const encoded = encodeS3Path(fullKey(key));
    if (this.pathStyle) {
      const url = new URL(`${this.endpoint}/${this.bucket}/${encoded}`);
      return { url, path: `/${this.bucket}/${encoded}` };
    }
    const base = new URL(this.endpoint);
    const url = new URL(`${base.protocol}//${this.bucket}.${base.host}/${encoded}`);
    return { url, path: `/${encoded}` };
  }

  private async request(method: "PUT" | "DELETE", key: string, body?: Buffer, extra: Record<string, string> = {}) {
    const { url, path } = this.objectUrl(key);
    const payloadHash = sha256Hex(body ?? "");
    const amzDate = amzDateNow();
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...extra,
    };
    const { authorization } = signV4({
      method,
      path,
      query: "",
      headers,
      payloadHash,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      amzDate,
    });
    const res = await fetch(url, { method, headers: { ...headers, authorization }, body: body ? new Uint8Array(body) : undefined });
    if (!res.ok && !(method === "DELETE" && res.status === 404)) {
      throw new Error(`S3 ${method} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }

  async put(input: PutInput) {
    const key = fullKey(input.key);
    await this.request("PUT", key, input.body, {
      "content-type": input.contentType,
      "cache-control": `public, max-age=${input.cacheSeconds ?? 31536000}, immutable`,
    });
    return { key, url: this.urlFor(key) };
  }

  async delete(key: string) {
    await this.request("DELETE", key);
  }

  urlFor(key: string): string {
    const encoded = encodeS3Path(fullKey(key));
    if (this.publicUrl) return `${this.publicUrl}/${encoded}`;
    return this.objectUrl(key).url.toString();
  }
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} é obrigatório com STORAGE_DRIVER=s3`);
  return v;
}
