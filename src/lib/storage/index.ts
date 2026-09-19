import "server-only";
import { LocalStorageProvider } from "./local";
import type { StorageProvider } from "./provider";
import { S3StorageProvider } from "./s3";

let instance: StorageProvider | null = null;

/** Driver conforme STORAGE_DRIVER (default: local). */
export function getStorage(): StorageProvider {
  if (instance) return instance;
  instance = process.env.STORAGE_DRIVER === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
  return instance;
}

export type { StorageProvider } from "./provider";
