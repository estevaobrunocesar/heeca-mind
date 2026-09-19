import "server-only";

/**
 * Armazenamento de arquivos (fotos de perfil hoje; documentos e recibos amanhã).
 *
 * Drivers: `local` (public/uploads — dev e servidores próprios) e `s3`
 * (S3/R2/MinIO — serverless). Escolhido por STORAGE_DRIVER.
 *
 * Todas as chaves levam o prefixo do produto (`hecca-psico/`), para que um
 * bucket compartilhado entre os produtos Heeca não misture arquivos.
 */

export const KEY_PREFIX = "hecca-psico/";

export type PutInput = {
  /** Caminho relativo, sem o prefixo do produto. Ex.: "professionals/abc/photo.jpg" */
  key: string;
  body: Buffer;
  contentType: string;
  /** Cache-Control público; fotos de perfil podem ser cacheadas por muito tempo (a chave muda a cada upload). */
  cacheSeconds?: number;
};

export interface StorageProvider {
  put(input: PutInput): Promise<{ key: string; url: string }>;
  delete(key: string): Promise<void>;
  /** URL pública de uma chave já gravada. */
  urlFor(key: string): string;

  /**
   * Objetos privados (documentos clínicos): nunca ganham URL; só o servidor
   * lê, via getPrivate, depois de autorizar. O chamador grava o conteúdo já
   * cifrado — o driver não sabe (nem precisa) se o bucket é público.
   */
  putPrivate(key: string, body: Buffer): Promise<{ key: string }>;
  getPrivate(key: string): Promise<Buffer | null>;
  deletePrivate(key: string): Promise<void>;
}

export function fullKey(key: string): string {
  return key.startsWith(KEY_PREFIX) ? key : KEY_PREFIX + key;
}
