"use client";

import { useRef, useState, useTransition } from "react";
import { removeProfilePhotoAction, uploadProfilePhotoAction } from "./actions";

const SIZE = 512;
const QUALITY = 0.86;

/**
 * Recorta ao quadrado central e redimensiona para SIZE×SIZE no navegador.
 * Uma foto de 8 MB do celular vira ~50 KB de JPEG antes de sair do aparelho.
 */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível processar a imagem"))), "image/jpeg", QUALITY),
  );
}

export function PhotoUploader({ photoUrl, displayName }: { photoUrl: string | null; displayName: string }) {
  const [preview, setPreview] = useState<string | null>(photoUrl);
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
    let blob: Blob;
    try {
      blob = await squareJpeg(file);
    } catch {
      setError("Não foi possível ler a imagem. Tente outro arquivo (JPG ou PNG).");
      return;
    }
    const localUrl = URL.createObjectURL(blob);
    setPreview(localUrl);

    const fd = new FormData();
    fd.set("photo", blob, "photo.jpg");
    start(async () => {
      const r = await uploadProfilePhotoAction(fd);
      if (r.ok) {
        setPreview(r.url);
      } else {
        setError(r.error);
        setPreview(photoUrl);
      }
      URL.revokeObjectURL(localUrl);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <section className="card">
      <h2 className="text-base font-semibold">Foto profissional</h2>
      <p className="mt-1 text-sm text-text-muted">Aparece na sua página de agendamento. Recortada ao quadrado e reduzida automaticamente.</p>
      <div className="mt-4 flex items-center gap-5">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className={`h-24 w-24 rounded-full object-cover ${pending ? "opacity-60" : ""}`} />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary-soft text-2xl font-semibold text-primary">
            {displayName.charAt(0)}
          </div>
        )}
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pending} onClick={() => inputRef.current?.click()}>
              {pending ? "Enviando…" : preview ? "Trocar foto" : "Enviar foto"}
            </button>
            {preview && (
              <button
                type="button"
                className="btn-ghost text-text-muted"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await removeProfilePhotoAction();
                    setPreview(null);
                  })
                }
              >
                Remover
              </button>
            )}
          </div>
          <p className="text-xs text-text-muted">JPG, PNG ou WebP. Prefira uma foto de rosto, com boa luz e fundo neutro.</p>
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
