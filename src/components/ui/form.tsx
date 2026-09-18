"use client";

import { useFormStatus } from "react-dom";

export function Field({
  label,
  name,
  type = "text",
  errors,
  autoComplete,
  placeholder,
  hint,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  errors?: string[];
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  const id = `field-${name}`;
  const err = errors?.[0];
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        className="input"
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        aria-invalid={!!err}
        aria-describedby={err ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {err ? (
        <p id={`${id}-error`} className="field-error">
          {err}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? (pendingText ?? "Aguarde…") : children}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="status" className="rounded-lg border border-success/30 bg-primary-soft px-3 py-2 text-sm text-success">
      {message}
    </div>
  );
}
