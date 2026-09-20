"use client";

import { useRef, useState, useTransition } from "react";
import { removeClinicLogoAction, uploadClinicLogoAction } from "./actions";

const MAX_W = 640;
const MAX_H = 256;

/**
 * Logo da clínica: redimensiona no navegador para caber em MAX_W×MAX_H mantendo a proporção
 * (logos costumam ser horizontais — nada de recorte quadrado como na foto de perfil).
 * PNG/WebP saem como PNG para preservar transparência; JPG continua JPG.
 */
async function fitLogo(file: File): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const keepAlpha = file.type === "image/png" || file.type === "image/webp";
  const type = keepAlpha ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível processar a imagem"))), type, 0.9),
  );
  return { blob, ext: keepAlpha ? "png" : "jpg" };
}

export function LogoUploader({ logoUrl, orgName }: { logoUrl: string | null; orgName: string }) {
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem.");
      return;
    }
    let fitted: { blob: Blob; ext: string };
    try {
      fitted = await fitLogo(file);
    } catch {
      setError("Não foi possível ler a imagem. Tente outro arquivo (PNG, JPG ou WebP).");
      return;
    }
    const localUrl = URL.createObjectURL(fitted.blob);
    setPreview(localUrl);
    const fd = new FormData();
    fd.set("logo", fitted.blob, `logo.${fitted.ext}`);
    start(async () => {
      const r = await uploadClinicLogoAction(fd);
      if (r.ok) setPreview(r.url);
      else {
        setError(r.error);
        setPreview(logoUrl);
      }
      URL.revokeObjectURL(localUrl);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <section className="card">
      <h2 className="text-base font-semibold">Logo</h2>
      <p className="mt-1 text-sm text-text-muted">Aparece na página de agendamento, no portal do paciente e nos documentos. Reduzida automaticamente.</p>
      <div className="mt-4 flex items-center gap-5">
        <div className={`flex h-20 w-40 items-center justify-center rounded-lg border border-border bg-surface-muted p-2 ${pending ? "opacity-60" : ""}`}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={`Logo de ${orgName}`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-text-muted">Sem logo</span>
          )}
        </div>
        <div className="space-y-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pending} onClick={() => inputRef.current?.click()}>
              {pending ? "Enviando…" : preview ? "Trocar logo" : "Enviar logo"}
            </button>
            {preview && (
              <button
                type="button"
                className="btn-ghost text-text-muted"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await removeClinicLogoAction();
                    setPreview(null);
                  })
                }
              >
                Remover
              </button>
            )}
          </div>
          <p className="text-xs text-text-muted">PNG com fundo transparente fica melhor. JPG e WebP também servem.</p>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
