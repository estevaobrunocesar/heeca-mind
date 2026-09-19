import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fullKey, type PutInput, type StorageProvider } from "./provider";

/**
 * Grava em public/uploads/<chave>. Next serve `public/` estaticamente, então
 * a URL é /uploads/<chave>. Não funciona em plataformas com filesystem
 * efêmero (Vercel) — use o driver s3 lá.
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly root = path.join(process.cwd(), "public", "uploads");
  /** Fora de public/: o Next nunca serve daqui. PRIVATE_STORAGE_DIR aponta o volume em produção. */
  private readonly privateRoot = path.resolve(process.env.PRIVATE_STORAGE_DIR || path.join(process.cwd(), "storage", "private"));

  private safePath(key: string, root = this.root): string {
    const resolved = path.resolve(root, fullKey(key));
    if (!resolved.startsWith(root + path.sep)) throw new Error("Chave de storage inválida");
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

  async putPrivate(key: string, body: Buffer) {
    const k = fullKey(key);
    const file = this.safePath(k, this.privateRoot);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, { mode: 0o600 });
    return { key: k };
  }

  async getPrivate(key: string) {
    try {
      return await readFile(this.safePath(key, this.privateRoot));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async deletePrivate(key: string) {
    const file = this.safePath(key, this.privateRoot);
    await rm(file, { force: true });
    await rm(path.dirname(file), { recursive: false }).catch(() => {}); // só se ficou vazia
  }

  urlFor(key: string): string {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return `${base}/uploads/${fullKey(key)}`;
  }
}
