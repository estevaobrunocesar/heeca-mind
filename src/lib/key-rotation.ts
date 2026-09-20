import "server-only";
import { randomUUID } from "node:crypto";
import { currentKeyId, isCurrent, rotateBytes, rotateText } from "./crypto";
import { db } from "./db";
import { getStorage } from "./storage";

/**
 * Rotação de ENCRYPTION_KEY: recifra tudo que não está na chave atual.
 *
 * Idempotente e resumível: cada registro é avaliado por `isCurrent` (sem
 * decifrar) e só é regravado se precisar. Pode rodar quantas vezes for
 * necessário; quando `pending` chega a 0, a chave antiga pode sair de
 * ENCRYPTION_KEY_PREVIOUS.
 *
 * Blobs: o novo conteúdo vai para uma chave de storage NOVA e a linha é
 * atualizada depois — se cair no meio, sobra no máximo um blob órfão, nunca
 * uma linha apontando para bytes ilegíveis.
 *
 * Onde há dado cifrado (mantenha esta lista em dia ao criar campos *Enc):
 *   ClinicalNote.contentEnc · ClinicalDocument.{titleEnc,descriptionEnc,fileNameEnc,blob}
 *   FormRequest.answersEnc · User.mfaSecretEnc
 */

export type RotationReport = {
  keyId: string;
  dryRun: boolean;
  tables: Record<string, { scanned: number; rotated: number; pending: number; failed: number }>;
  errors: string[];
};

const BATCH = 200;

export async function rotateAllKeys(opts: { dryRun?: boolean; log?: (line: string) => void } = {}): Promise<RotationReport> {
  const dryRun = opts.dryRun ?? false;
  const log = opts.log ?? (() => {});
  const report: RotationReport = { keyId: currentKeyId(), dryRun, tables: {}, errors: [] };
  const stat = (name: string) => (report.tables[name] ??= { scanned: 0, rotated: 0, pending: 0, failed: 0 });

  // ── ClinicalNote.contentEnc
  {
    const s = stat("clinical_notes");
    let cursor: string | undefined;
    for (;;) {
      const rows = await db.clinicalNote.findMany({ take: BATCH, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, contentEnc: true } });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      for (const r of rows) {
        s.scanned++;
        if (isCurrent(r.contentEnc)) continue;
        s.pending++;
        if (dryRun) continue;
        try {
          const { payload } = rotateText(r.contentEnc);
          await db.clinicalNote.update({ where: { id: r.id }, data: { contentEnc: payload } });
          s.rotated++;
          s.pending--;
        } catch (e) {
          s.failed++;
          report.errors.push(`clinical_notes ${r.id}: ${(e as Error).message}`);
        }
      }
    }
    log(`clinical_notes: ${JSON.stringify(s)}`);
  }

  // ── FormRequest.answersEnc
  {
    const s = stat("form_requests");
    let cursor: string | undefined;
    for (;;) {
      const rows = await db.formRequest.findMany({ where: { answersEnc: { not: null } }, take: BATCH, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, answersEnc: true } });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      for (const r of rows) {
        s.scanned++;
        if (isCurrent(r.answersEnc!)) continue;
        s.pending++;
        if (dryRun) continue;
        try {
          await db.formRequest.update({ where: { id: r.id }, data: { answersEnc: rotateText(r.answersEnc!).payload } });
          s.rotated++;
          s.pending--;
        } catch (e) {
          s.failed++;
          report.errors.push(`form_requests ${r.id}: ${(e as Error).message}`);
        }
      }
    }
    log(`form_requests: ${JSON.stringify(s)}`);
  }

  // ── User.mfaSecretEnc
  {
    const s = stat("users_mfa");
    const rows = await db.user.findMany({ where: { mfaSecretEnc: { not: null } }, select: { id: true, mfaSecretEnc: true } });
    for (const r of rows) {
      s.scanned++;
      if (isCurrent(r.mfaSecretEnc!)) continue;
      s.pending++;
      if (dryRun) continue;
      try {
        await db.user.update({ where: { id: r.id }, data: { mfaSecretEnc: rotateText(r.mfaSecretEnc!).payload } });
        s.rotated++;
        s.pending--;
      } catch (e) {
        s.failed++;
        report.errors.push(`users_mfa ${r.id}: ${(e as Error).message}`);
      }
    }
    log(`users_mfa: ${JSON.stringify(s)}`);
  }

  // ── ClinicalDocument: campos + blob
  {
    const s = stat("clinical_documents");
    const storage = getStorage();
    let cursor: string | undefined;
    for (;;) {
      const rows = await db.clinicalDocument.findMany({
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: { id: true, patientId: true, titleEnc: true, descriptionEnc: true, fileNameEnc: true, storageKey: true },
      });
      if (rows.length === 0) break;
      cursor = rows[rows.length - 1].id;
      for (const r of rows) {
        s.scanned++;
        const fieldsCurrent = isCurrent(r.titleEnc) && isCurrent(r.fileNameEnc) && (r.descriptionEnc === null || isCurrent(r.descriptionEnc));
        let blob: Buffer | null = null;
        let blobCurrent = true;
        try {
          blob = await storage.getPrivate(r.storageKey);
          if (!blob) throw new Error("blob ausente no storage");
          blobCurrent = isCurrent(blob);
        } catch (e) {
          s.failed++;
          report.errors.push(`clinical_documents ${r.id}: ${(e as Error).message}`);
          continue;
        }
        if (fieldsCurrent && blobCurrent) continue;
        s.pending++;
        if (dryRun) continue;
        try {
          let newKey = r.storageKey;
          if (!blobCurrent) {
            newKey = `clinical/${r.patientId}/${randomUUID()}.bin`;
            const put = await storage.putPrivate(newKey, rotateBytes(blob!).data);
            newKey = put.key;
          }
          await db.clinicalDocument.update({
            where: { id: r.id },
            data: {
              titleEnc: rotateText(r.titleEnc).payload,
              fileNameEnc: rotateText(r.fileNameEnc).payload,
              descriptionEnc: r.descriptionEnc === null ? null : rotateText(r.descriptionEnc).payload,
              storageKey: newKey,
            },
          });
          if (newKey !== r.storageKey) await storage.deletePrivate(r.storageKey).catch(() => {});
          s.rotated++;
          s.pending--;
        } catch (e) {
          s.failed++;
          report.errors.push(`clinical_documents ${r.id}: ${(e as Error).message}`);
        }
      }
    }
    log(`clinical_documents: ${JSON.stringify(s)}`);
  }

  return report;
}

/** Quantos registros ainda não estão na chave atual (para health/monitoramento). Barato: não decifra. */
export async function countPendingRotation(): Promise<number> {
  const r = await rotateAllKeys({ dryRun: true });
  return Object.values(r.tables).reduce((n, t) => n + t.pending, 0);
}
