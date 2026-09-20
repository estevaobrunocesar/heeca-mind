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
  defaultValue,
  inputMode,
  maxLength,
  list,
}: {
  label: string;
  name: string;
  type?: string;
  errors?: string[];
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  /** id de um <datalist> com sugestões */
  list?: string;
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
        defaultValue={defaultValue ?? undefined}
        inputMode={inputMode}
        maxLength={maxLength}
        list={list}
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

export function TextArea({
  label,
  name,
  errors,
  hint,
  defaultValue,
  rows = 3,
  placeholder,
}: {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
  defaultValue?: string | null;
  rows?: number;
  placeholder?: string;
}) {
  const id = `field-${name}`;
  const err = errors?.[0];
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        className="input resize-y"
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        aria-invalid={!!err}
      />
      {err ? <p className="field-error">{err}</p> : hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function Select({
  label,
  name,
  options,
  errors,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  errors?: string[];
  defaultValue?: string | null;
  hint?: string;
}) {
  const id = `field-${name}`;
  const err = errors?.[0];
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {/* key: o React so aplica defaultValue de <select> na montagem; remontamos quando ele muda. */}
      <select
        key={defaultValue ?? ""}
        id={id}
        name={name}
        className="input"
        defaultValue={defaultValue ?? ""}
        aria-invalid={!!err}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {err ? <p className="field-error">{err}</p> : hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({
  label,
  name,
  defaultChecked,
  hint,
  value,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
  /** Para grupos (vários checkboxes com o mesmo name): o valor enviado. */
  value?: string;
}) {
  const id = value ? `field-${name}-${value}` : `field-${name}`;
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-border accent-primary"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
    </div>
  );
}
