"use client";

import { useState, useTransition } from "react";
import { confirmMfaAction, disableMfaAction, regenerateRecoveryAction, startMfaAction, type EnrollmentStart } from "./actions";

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
      <p className="font-medium">Guarde estes códigos de recuperação</p>
      <p className="mt-1 text-sm text-text-muted">
        Cada um vale uma única vez e substitui o app se você perder o celular. Eles não serão mostrados de novo.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="rounded bg-surface px-2 py-1">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            const blob = new Blob([`Hecca Psico — códigos de recuperação\n\n${codes.join("\n")}\n`], { type: "text/plain" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "hecca-psico-codigos-recuperacao.txt";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Baixar .txt
        </button>
        <button type="button" className="btn-primary" onClick={onDone}>
          Guardei os códigos
        </button>
      </div>
    </div>
  );
}

function CodeInput({ value, onChange, label = "Código do app" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input w-40 font-mono tracking-widest"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function MfaPanel({ enabled, enabledAt, recoveryLeft, lowWarning }: { enabled: boolean; enabledAt: string | null; recoveryLeft: number; lowWarning: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollmentStart | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "regen" | "disable">("idle");

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(fn);
  };

  if (codes) return <RecoveryCodes codes={codes} onDone={() => { setCodes(null); setEnroll(null); setMode("idle"); setCode(""); }} />;

  if (!enabled) {
    return (
      <section className="card space-y-4">
        <div>
          <h2 className="text-base font-semibold">Verificação em duas etapas (MFA)</h2>
          <p className="mt-1 text-sm text-text-muted">
            Além da senha, um código de 6 dígitos gerado no seu celular. Recomendado: você lida com dados de saúde.
          </p>
        </div>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {!enroll ? (
          <button type="button" className="btn-primary" disabled={pending} onClick={() => run(async () => setEnroll(await startMfaAction()))}>
            {pending ? "Gerando…" : "Ativar MFA"}
          </button>
        ) : (
          <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qrDataUrl} alt="QR code para o app autenticador" className="h-[220px] w-[220px] rounded-lg border border-border" />
            <div className="space-y-3 text-sm">
              <ol className="list-decimal space-y-1 pl-5 text-text-muted">
                <li>Instale Google Authenticator, Authy, 1Password ou similar.</li>
                <li>Escaneie o QR code — ou digite a chave manualmente:</li>
              </ol>
              <code className="block break-all rounded bg-surface-muted p-2 font-mono text-xs">{enroll.secret.match(/.{1,4}/g)?.join(" ")}</code>
              <p className="text-text-muted">3. Digite o código que o app mostra para confirmar:</p>
              <CodeInput value={code} onChange={setCode} />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pending || code.replace(/\D/g, "").length !== 6}
                  onClick={() =>
                    run(async () => {
                      const r = await confirmMfaAction(code);
                      if (r.ok) setCodes(r.recoveryCodes);
                      else setError(r.error);
                    })
                  }
                >
                  {pending ? "Verificando…" : "Confirmar e ativar"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => { setEnroll(null); setCode(""); }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Verificação em duas etapas (MFA)</h2>
          <p className="mt-1 text-sm text-text-muted">Ativa{enabledAt ? ` desde ${enabledAt}` : ""}. Códigos de recuperação restantes: {recoveryLeft}.</p>
        </div>
        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">Ativa</span>
      </div>
      {(lowWarning || recoveryLeft <= 2) && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">Poucos códigos de recuperação. Gere novos e guarde-os.</p>
      )}
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => setMode("regen")}>
            Gerar novos códigos de recuperação
          </button>
          <button type="button" className="btn-ghost hover:text-danger" onClick={() => setMode("disable")}>
            Desativar MFA
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-border bg-surface-muted/50 p-4">
          <p className="text-sm">
            {mode === "regen" ? "Confirme com o código do app para gerar novos códigos (os antigos deixam de valer)." : "Confirme com o código do app para desativar."}
          </p>
          <CodeInput value={code} onChange={setCode} />
          <div className="flex gap-2">
            <button
              type="button"
              className={mode === "disable" ? "btn-ghost text-danger hover:bg-danger-soft" : "btn-primary"}
              disabled={pending || code.replace(/\D/g, "").length !== 6}
              onClick={() =>
                run(async () => {
                  if (mode === "regen") {
                    const r = await regenerateRecoveryAction(code);
                    if (r.ok) setCodes(r.recoveryCodes);
                    else setError(r.error);
                  } else {
                    const r = await disableMfaAction(code);
                    if (!r.ok) setError(r.error);
                    else { setMode("idle"); setCode(""); }
                  }
                })
              }
            >
              {pending ? "…" : mode === "regen" ? "Gerar códigos" : "Desativar"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setMode("idle"); setCode(""); setError(null); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
