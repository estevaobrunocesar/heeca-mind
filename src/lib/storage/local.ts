import "server-only";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fullKey, type PutInput, type StorageProvider } from "./provider";

/**
 * Grava em public/uploads/<chave>. Next serve `public/` estaticamente, então
 * a URL é /uploads/<chave>. Não funciona em plataformas com filesystem
 * efêmero (Vercel) — use o driver s3 lá.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly root = path.join(process.cwd(), "public", "uploads");

  private safePath(key: string): string {
    const resolved = path.resolve(this.root, fullKey(key));
    if (!resolved.startsWith(this.root + path.sep)) throw new Error("Chave de storage inválida");
    return resolved;
  }

  async put(input: PutInput) {
    const key = fullKey(input.key);
    const file = this.safePath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, input.body);
    return { key, url: this.urlFor(key) };
  }

  async delete(key: string) {
    await rm(this.safePath(key), { force: true });
  }

  urlFor(key: string): string {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return `${base}/uploads/${fullKey(key)}`;
  }
}
