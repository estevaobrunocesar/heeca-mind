import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { formatDateBR } from "@/lib/time";
import { MfaPanel } from "./mfa-panel";
import { SessionsPanel } from "./sessions-panel";
import { auth } from "@/auth";
import { describeUserAgent, listActiveSessions } from "@/lib/sessions";
import { formatDateTimeBR } from "@/lib/time";

export const metadata: Metadata = { title: "Segurança" };

export default async function SecurityPage({ searchParams }: PageProps<"/configuracoes/seguranca">) {
  const sp = await searchParams;
  const actor = await requireActor();
  const currentSid = (await auth())?.user.sid;
  const [user, org, logins, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { mfaEnabled: true, mfaEnabledAt: true, mfaRecoveryHashes: true, email: true } }),
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } }),
    db.accessLog.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: "desc" }, take: 10, select: { createdAt: true, success: true, ip: true, userAgent: true } }),
    listActiveSessions(actor.userId),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <MfaPanel
        enabled={user.mfaEnabled}
        enabledAt={user.mfaEnabledAt ? formatDateBR(user.mfaEnabledAt, org.timezone) : null}
        recoveryLeft={user.mfaRecoveryHashes.length}
        lowWarning={sp.low === "1"}
      />
      <SessionsPanel
        sessions={sessions.map((x) => ({
          sid: x.sid,
          device: describeUserAgent(x.userAgent),
          ip: x.ip,
          createdAt: formatDateTimeBR(x.createdAt, org.timezone),
          lastSeenAt: formatDateTimeBR(x.lastSeenAt, org.timezone),
          current: x.sid === currentSid,
        }))}
      />
      <section className="card">
        <h2 className="text-base font-semibold">Últimos acessos</h2>
        <p className="mt-1 text-sm text-text-muted">Conta: {user.email}</p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {logins.map((l, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <span>
                {l.createdAt.toLocaleString("pt-BR", { timeZone: org.timezone, dateStyle: "short", timeStyle: "short" })}
                <span className="ml-2 text-xs text-text-muted">{l.userAgent === "mfa" ? "segundo fator" : (l.ip ?? "")}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${l.success ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger"}`}>{l.success ? "ok" : "falhou"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
