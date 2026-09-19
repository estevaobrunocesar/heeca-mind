"use client";

import { useState, useTransition } from "react";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/patient";
import { quickPayAction } from "./actions";

/** Marca como pago com um clique, usando a forma habitual do paciente. */
export function QuickPay({ appointmentId, defaultMethod }: { appointmentId: string; defaultMethod: PaymentMethod }) {
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1">
      <select
        className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs"
        value={method}
        onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        aria-label="Forma de pagamento"
      >
        {Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded-md bg-primary-soft px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
        disabled={pending}
        onClick={() => start(() => quickPayAction(appointmentId, method))}
      >
        {pending ? "…" : "Marcar pago"}
      </button>
    </div>
  );
}
