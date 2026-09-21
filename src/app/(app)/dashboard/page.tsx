import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/dashboard/avatar";
import { AreaChart, CORES_FATIAS, Donut, Ring, Sparkline } from "@/components/dashboard/charts";
import { pct, workingMinutes } from "@/lib/reports/rules";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/appointment-status";
import { addDaysCivil } from "@/lib/availability";
import { ACTIVE_STATUSES } from "@/lib/availability-data";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { canViewFinancials } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { dateTimeInTz, slotLabelInTz, todayCivilAndMonth, toLocalFields } from "@/lib/time";

export const metadata: Metadata = { title: "Início" };

/**
 * Painel inicial (padrão Heeca, ../docs/PADRAO-PAINEL.md) com os números do Mind: sessões hoje, recebido no mês,
 * pacientes ativos e aguardando ação com mini-gráficos; recebido por dia + rosca online/presencial; comparecimento,
 * inativos há 90+ dias e lista de espera; sessões de hoje e feed de mensagens; coluna direita com meta do mês,
 * próxima sessão, ocupação da semana e ações rápidas. Quem não pode ver valores (canViewFinancials) vê o painel sem
 * dinheiro. O escopo segue o profissional ativo (seletor da clínica) ou a organização inteira.
 */
const DIA = 86_400_000;
const saudacao = (h: number) => (h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite");
const TAG: Record<string, string> = { neutral: "tag-mut", warning: "tag-warn", success: "tag-ok", danger: "tag-bad", muted: "tag-mut" };
const CANCELADOS = ["CANCELLED_BY_PATIENT", "CANCELLED_BY_PROFESSIONAL", "EXPIRED"] as const;

export default async function DashboardPage() {
  const actor = await requireActor();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true, metaMensalCents: true } });
  const tz = org.timezone;
  const now = new Date();
  const { date: todayISO, month } = todayCivilAndMonth(now, tz);
  const dayStart = dateTimeInTz(todayISO, "00:00", tz);
  const dayEnd = dateTimeInTz(addDaysCivil(todayISO, 1), "00:00", tz);
  const yesterday = dateTimeInTz(addDaysCivil(todayISO, -1), "00:00", tz);
  const monthStart = dateTimeInTz(`${month}-01`, "00:00", tz);
  const [y, m] = month.split("-").map(Number);
  const monthEnd = dateTimeInTz(`${m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`}-01`, "00:00", tz);
  const prevMonthStart = dateTimeInTz(`${m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`}-01`, "00:00", tz);
  const since90 = new Date(now.getTime() - 90 * DIA);
  const horaLocal = Number(toLocalFields(now, tz).time.slice(0, 2));

  const scope = actor.activeProfessionalId ? { professionalId: actor.activeProfessionalId } : { organizationId: actor.organizationId };
  const active = { in: [...ACTIVE_STATUSES] };
  const showMoney = actor.activeProfessionalId ? canViewFinancials(actor, actor.activeProfessionalId) : actor.role === "OWNER";
  const weekEndISO = addDaysCivil(todayISO, 7);

  const [user, todaySessions, ontem, nextSession, patientCount, patientCountAntes, pendingCount, monthAppts, pagamentosMes, pagamentosAntes, recentes, inactivePatients, waitlistCount, weekBooked, weekRules, notificacoes] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } }),
    db.appointment.findMany({
      where: { ...scope, startsAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, endsAt: true, status: true, modality: true, serviceNameSnapshot: true, priceCents: true, paymentStatus: true, patient: { select: { id: true, name: true } } },
    }),
    db.appointment.count({ where: { ...scope, startsAt: { gte: yesterday, lt: dayStart }, status: { notIn: [...CANCELADOS] } } }),
    db.appointment.findFirst({
      where: { ...scope, endsAt: { gt: now }, status: active },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, endsAt: true, serviceNameSnapshot: true, modality: true, onlineLink: true, patient: { select: { id: true, name: true } }, professional: { select: { displayName: true, photoUrl: true } } },
    }),
    db.patient.count({ where: { organizationId: actor.organizationId, deletedAt: null, followUpStatus: "ACTIVE" } }),
    db.patient.count({ where: { organizationId: actor.organizationId, deletedAt: null, followUpStatus: "ACTIVE", createdAt: { lt: monthStart } } }),
    db.appointment.count({ where: { ...scope, status: { in: ["PENDING", "AWAITING_CONFIRMATION", "RESCHEDULE_REQUESTED"] }, startsAt: { gte: now } } }),
    db.appointment.findMany({ where: { ...scope, startsAt: { gte: monthStart, lt: monthEnd } }, select: { status: true, modality: true, priceCents: true, paymentStatus: true } }),
    showMoney ? db.payment.findMany({ where: { OR: [{ appointment: scope }, { packagePurchase: scope }], paidAt: { gte: monthStart, lt: monthEnd } }, select: { paidAt: true, amountCents: true } }) : Promise.resolve([]),
    showMoney ? db.payment.aggregate({ where: { OR: [{ appointment: scope }, { packagePurchase: scope }], paidAt: { gte: prevMonthStart, lt: monthStart } }, _sum: { amountCents: true } }) : Promise.resolve({ _sum: { amountCents: 0 } }),
    db.appointment.findMany({ where: { ...scope, status: "COMPLETED", startsAt: { gte: since90 } }, select: { startsAt: true } }),
    db.patient.count({ where: { organizationId: actor.organizationId, deletedAt: null, followUpStatus: "ACTIVE", OR: [{ lastCompletedAt: { lt: since90 } }, { lastCompletedAt: null, createdAt: { lt: since90 } }] } }),
    db.waitlistEntry.count({ where: { organizationId: actor.organizationId, status: "WAITING", ...(actor.activeProfessionalId ? { professionalId: actor.activeProfessionalId } : {}) } }),
    db.appointment.aggregate({ where: { ...scope, startsAt: { gte: dayStart, lt: dateTimeInTz(weekEndISO, "00:00", tz) }, status: { in: [...ACTIVE_STATUSES, "COMPLETED"] } }, _sum: { durationMinutes: true } }),
    db.availabilityRule.findMany({ where: actor.activeProfessionalId ? { professionalId: actor.activeProfessionalId } : { professional: { organizationId: actor.organizationId, isActive: true } }, select: { weekday: true, startTime: true, endTime: true } }),
    db.notification.findMany({ where: { organizationId: actor.organizationId, status: { not: "QUEUED" } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, type: true, status: true, createdAt: true, patient: { select: { name: true } } } }),
  ]);
  const weekCapacity = workingMinutes(weekRules, todayISO, addDaysCivil(weekEndISO, -1));
  const weekOccupancy = pct(weekBooked._sum.durationMinutes ?? 0, weekCapacity);

  // Indicadores do mês
  const completed = monthAppts.filter((a) => a.status === "COMPLETED");
  const noShow = monthAppts.filter((a) => a.status === "NO_SHOW");
  const attendance = completed.length + noShow.length > 0 ? Math.round((completed.length / (completed.length + noShow.length)) * 100) : null;
  const countable = monthAppts.filter((a) => ["COMPLETED", "CONFIRMED", "AWAITING_PAYMENT", "PENDING", "AWAITING_CONFIRMATION"].includes(a.status));
  const online = countable.filter((a) => a.modality === "ONLINE").length;
  const inPerson = countable.length - online;
  const forecast = monthAppts.filter((a) => ["COMPLETED", "CONFIRMED", "AWAITING_PAYMENT"].includes(a.status) && a.paymentStatus !== "WAIVED" && a.paymentStatus !== "PACKAGE").reduce((s, a) => s + a.priceCents, 0);
  const pendingMoney = completed.filter((a) => a.paymentStatus === "PENDING").reduce((s, a) => s + a.priceCents, 0);

  // Recebido no mês por dia e últimos 7 dias
  const recebido = pagamentosMes.reduce((n, p) => n + p.amountCents, 0);
  const recebidoAntes = pagamentosAntes._sum.amountCents ?? 0;
  const deltaRecebido = recebidoAntes > 0 ? Math.round(((recebido - recebidoAntes) / recebidoAntes) * 100) : null;
  const chave = (d: Date) => toLocalFields(d, tz).date;
  const porDia = new Map<number, number>();
  for (const p of pagamentosMes) { const d = Number(chave(p.paidAt).slice(8, 10)); porDia.set(d, (porDia.get(d) ?? 0) + p.amountCents); }
  const hojeDia = Number(todayISO.slice(8, 10));
  const mesAbrev = monthStart.toLocaleDateString("pt-BR", { timeZone: tz, month: "short" }).replace(".", "");
  const mesNome = monthStart.toLocaleDateString("pt-BR", { timeZone: tz, month: "long" });
  const serie = Array.from({ length: hojeDia }, (_, i) => ({ rotulo: `${i + 1} ${mesAbrev}`, valor: (porDia.get(i + 1) ?? 0) / 100 }));
  const ultimos7 = (f: (k: string) => number) => { const out: number[] = []; for (let i = 6; i >= 0; i--) out.push(f(chave(new Date(now.getTime() - i * DIA)))); return out; };
  const sparkRecebido = ultimos7((k) => pagamentosMes.filter((p) => chave(p.paidAt) === k).reduce((n, p) => n + p.amountCents, 0));
  const sparkSessoes = ultimos7((k) => recentes.filter((a) => chave(a.startsAt) === k).length);
  const fatias = [{ rotulo: "Online", valor: online, cor: CORES_FATIAS[0] }, { rotulo: "Presencial", valor: inPerson, cor: CORES_FATIAS[1] }].filter((f) => f.valor > 0);

  const ativosHoje = todaySessions.filter((a) => !CANCELADOS.includes(a.status as (typeof CANCELADOS)[number]));
  const meta = org.metaMensalCents;
  const primeiroNome = user.name.split(" ")[0];
  const TIPO: Record<string, string> = { BOOKING_REQUEST: "pedido de confirmação para", BOOKING_CONFIRMED: "confirmação enviada para", REMINDER_24H: "lembrete de 24h para", REMINDER_2H: "lembrete de 2h para", SESSION_LINK: "link da sessão para", CANCELLATION: "aviso de cancelamento para", RESCHEDULE: "remarcação avisada a", WAITLIST_JOINED: "lista de espera confirmada a", WAITLIST_OFFER: "horário oferecido a", FORM_REQUEST: "formulário pedido a", DOCUMENT_REQUEST: "documento enviado para", PORTAL_LOGIN: "acesso ao portal enviado para" };
  const COR: Record<string, string> = { REMINDER_24H: "bg-sky-500", REMINDER_2H: "bg-sky-500", WAITLIST_OFFER: "bg-brand-600", CANCELLATION: "bg-zinc-400", RESCHEDULE: "bg-amber-500", FORM_REQUEST: "bg-emerald-500", DOCUMENT_REQUEST: "bg-emerald-500" };

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      {/* ─── coluna principal ─── */}
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[21px] font-semibold tracking-tight">{saudacao(horaLocal)}, {primeiroNome}! 👋</h1>
            <p className="mt-0.5 text-[13px] text-mut">Sua agenda, seus pacientes e o mês inteiro num lugar só.</p>
          </div>
          <Link href="/agenda/novo" className="btn-primary shrink-0">+ Nova sessão</Link>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi rotulo="Sessões hoje" valor={String(ativosHoje.length)} delta={ativosHoje.length - ontem} deltaTxt="vs ontem" cor="var(--color-brand-600)" tile="bg-brand-50 text-brand-600" icone="cal" spark={sparkSessoes} id="a" />
          {showMoney ? (
            <Kpi rotulo="Recebido no mês" valor={formatBRL(recebido)} delta={deltaRecebido} deltaTxt="vs mês anterior" pct cor="#16a34a" tile="bg-emerald-50 text-emerald-600" icone="money" spark={sparkRecebido} id="b" />
          ) : (
            <Kpi rotulo="Realizadas no mês" valor={String(completed.length)} deltaTxt={`${noShow.length} falta(s)`} cor="#16a34a" tile="bg-emerald-50 text-emerald-600" icone="check" spark={[]} id="b" />
          )}
          <Kpi rotulo="Pacientes ativos" valor={String(patientCount)} delta={patientCount - patientCountAntes} deltaTxt="novos no mês" cor="#2563eb" tile="bg-sky-50 text-sky-600" icone="users" spark={[patientCountAntes, patientCount]} id="c" />
          <Kpi rotulo="Aguardando ação" valor={String(pendingCount)} deltaTxt="pendentes, confirmação ou reagendamento" cor="#d97706" tile="bg-amber-50 text-amber-600" icone="clock" spark={[]} id="d" />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section className="card min-w-0 p-4">
            <div className="card-hd"><h2 className="card-title">{showMoney ? "Recebido" : "Sessões"}</h2><span className="rounded-[10px] border border-line px-2.5 py-1 text-xs font-medium capitalize text-ink-2">{mesNome}</span></div>
            {showMoney ? (
              recebido === 0 ? <p className="py-10 text-center text-sm text-mut">Ainda sem pagamentos neste mês.</p> : <AreaChart pontos={serie} formato={(v) => `R$ ${Math.round(v)}`} />
            ) : (
              <p className="py-10 text-center text-sm text-mut">{completed.length} sessão(ões) realizada(s) no mês · {attendance === null ? "—" : `${attendance}%`} de comparecimento.</p>
            )}
            {showMoney && recebido > 0 && <p className="mt-2 text-[11.5px] text-mut">Previsto: {formatBRL(forecast)} · a receber de sessões concluídas: <Link href="/financeiro" className="font-medium text-ink-2 hover:underline">{formatBRL(pendingMoney)}</Link></p>}
          </section>
          <section className="card min-w-0 p-4">
            <div className="card-hd"><h2 className="card-title">Online × presencial</h2></div>
            {fatias.length === 0 ? <p className="py-10 text-center text-sm text-mut">Sem sessões marcadas no mês.</p> : <Donut fatias={fatias} totalRotulo={`${countable.length} sess.`} />}
          </section>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Mini rotulo="Comparecimento" valor={attendance === null ? "—" : `${attendance}%`} tile={attendance !== null && attendance < 80 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"} icone="check" />
          <Mini href={actor.activeProfessionalId ? `/pacientes/reativacao?professional=${actor.activeProfessionalId}` : "/pacientes"} rotulo="Inativos há 90+ dias" valor={String(inactivePatients)} tile={inactivePatients > 0 ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600"} icone="refresh" />
          <Mini href="/agenda/espera" rotulo="Lista de espera" valor={String(waitlistCount)} tile={waitlistCount > 0 ? "bg-amber-50 text-amber-600" : "bg-sky-50 text-sky-600"} icone="list" />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <section className="card min-w-0 p-4">
            <div className="card-hd"><h2 className="card-title">Sessões de hoje</h2><Link href={`/agenda?view=day&date=${todayISO}`} className="link-mut">Ver agenda ›</Link></div>
            {todaySessions.length === 0 ? (
              <p className="py-8 text-center text-sm text-mut">Nenhuma sessão hoje.</p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
                  <thead><tr className="text-left text-[11.5px] text-mut"><th className="pb-2 pr-2 font-medium">Paciente</th><th className="pb-2 pr-2 font-medium">Serviço</th><th className="pb-2 pr-2 font-medium">Horário</th><th className="pb-2 pr-2 font-medium">Status</th>{showMoney && <th className="pb-2 text-right font-medium">Valor</th>}</tr></thead>
                  <tbody>
                    {todaySessions.map((a) => (
                      <tr key={a.id} className="border-t border-line">
                        <td className="py-2 pr-2"><Link href={`/agenda/${a.id}`} className="flex items-center gap-2 font-medium hover:underline"><Avatar name={a.patient.name} size="sm" />{a.patient.name}</Link></td>
                        <td className="py-2 pr-2 text-ink-2">{a.serviceNameSnapshot}<span className="text-mut"> · {a.modality === "ONLINE" ? "Online" : "Presencial"}</span></td>
                        <td className="py-2 pr-2 tabular-nums text-ink-2">{slotLabelInTz(a.startsAt, tz)} – {slotLabelInTz(a.endsAt, tz)}</td>
                        <td className="py-2 pr-2"><span className={TAG[STATUS_TONE[a.status]]}>{STATUS_LABEL[a.status]}</span></td>
                        {showMoney && <td className="py-2 text-right font-semibold">{a.paymentStatus === "PACKAGE" ? <span className="text-xs font-medium text-mut">pacote</span> : formatBRL(a.priceCents)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="card min-w-0 p-4">
            <div className="card-hd"><h2 className="card-title">Mensagens</h2><Link href="/mensagens" className="link-mut">Ver ›</Link></div>
            {notificacoes.length === 0 ? (
              <p className="py-8 text-center text-sm text-mut">Nenhuma mensagem enviada ainda.</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {notificacoes.map((n) => (
                  <li key={n.id} className="flex items-center gap-2.5 border-t border-line py-2 first:border-0 first:pt-0">
                    <span className={`size-2 shrink-0 rounded-full ${COR[n.type] ?? "bg-brand-400"}`} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">
                      {TIPO[n.type] ?? "mensagem para"} <b>{n.patient?.name ?? "paciente"}</b>{n.status === "FAILED" ? <span className="text-rose-600"> · falhou</span> : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-mut-2">{n.createdAt.toLocaleString("pt-BR", { timeZone: tz, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* ─── coluna direita ─── */}
      <aside className="grid min-w-0 content-start gap-3">
        {showMoney && (
          <section className="card min-w-0 p-4 text-center">
            <div className="card-hd text-left"><h2 className="card-title">Meta do mês</h2>{actor.role === "OWNER" && <Link href="/configuracoes/clinica" className="link-mut">{meta ? "editar" : "definir"}</Link>}</div>
            {meta ? (
              <>
                <div className="my-1 grid place-items-center"><Ring pct={(recebido / meta) * 100} /></div>
                <b className="block text-[13px]">{formatBRL(recebido)} de {formatBRL(meta)}</b>
                <p className="mt-0.5 text-xs text-mut">{recebido >= meta ? "Meta batida. Parabéns! 🎉" : recebido / meta >= 0.7 ? "Você está indo muito bem. Continue assim!" : "Vamos lá — o mês ainda não acabou."}</p>
              </>
            ) : (
              <p className="py-4 text-sm text-mut">Defina uma meta de recebimento em Configurações › Clínica e acompanhe aqui.</p>
            )}
          </section>
        )}

        <section className="card min-w-0 p-4">
          <div className="card-hd"><h2 className="card-title">Próxima sessão</h2>{nextSession && <Link href={`/agenda/${nextSession.id}`} className="link-mut">abrir ›</Link>}</div>
          {nextSession ? (
            <>
              <span className="tag-acc tabular-nums">{nextSession.startsAt >= dayEnd ? `${nextSession.startsAt.toLocaleDateString("pt-BR", { timeZone: tz, weekday: "short", day: "numeric", month: "numeric" }).replace(".", "")} · ` : ""}{slotLabelInTz(nextSession.startsAt, tz)} – {slotLabelInTz(nextSession.endsAt, tz)}</span>
              <b className="mt-2 block text-[14px]"><Link href={`/pacientes/${nextSession.patient.id}`} className="hover:underline">{nextSession.patient.name}</Link></b>
              <p className="text-xs text-mut">{nextSession.serviceNameSnapshot} · {nextSession.modality === "ONLINE" ? "Online" : "Presencial"}</p>
              {nextSession.modality === "ONLINE" && nextSession.onlineLink && <a href={nextSession.onlineLink} target="_blank" rel="noreferrer" className="mt-1.5 block text-[11.5px] font-medium text-brand-700 hover:underline">Abrir link da sessão ↗</a>}
              {!actor.activeProfessionalId && <div className="mt-2.5 flex items-center gap-2 text-xs text-mut"><Avatar name={nextSession.professional.displayName} photoUrl={nextSession.professional.photoUrl} size="sm" />{nextSession.professional.displayName}</div>}
            </>
          ) : (
            <p className="py-3 text-sm text-mut">Nenhuma sessão agendada.</p>
          )}
        </section>

        <section className="card min-w-0 p-4">
          <div className="card-hd"><h2 className="card-title">Ocupação da semana</h2><Link href="/agenda?view=week" className="link-mut">Agenda ›</Link></div>
          <div className="flex items-center gap-3">
            <Ring pct={weekOccupancy === null ? 0 : Math.min(100, weekOccupancy)} size={72} />
            <p className="text-xs text-mut">{Math.round((weekBooked._sum.durationMinutes ?? 0) / 60)} h marcadas de {Math.round(weekCapacity / 60)} h de grade nos próximos 7 dias.</p>
          </div>
        </section>

        <section className="card min-w-0 p-4">
          <div className="card-hd"><h2 className="card-title">Ações rápidas</h2></div>
          <div className="grid grid-cols-2 gap-2">
            <Acao href="/agenda/novo" rotulo="Nova sessão" tile="bg-brand-50 text-brand-600" icone="plus" />
            <Acao href="/pacientes/novo" rotulo="Novo paciente" tile="bg-emerald-50 text-emerald-600" icone="user" />
            <Acao href="/agenda/espera" rotulo="Lista de espera" tile="bg-sky-50 text-sky-600" icone="list" />
            <Acao href="/mensagens" rotulo="Mensagens" tile="bg-amber-50 text-amber-600" icone="chat" />
          </div>
        </section>
      </aside>
    </div>
  );
}

const ICONES: Record<string, React.ReactNode> = {
  cal: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 10h18M8 2v4M16 2v4" /></>,
  money: <><rect x="2" y="6" width="20" height="13" rx="3" /><circle cx="12" cy="12.5" r="3" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" /><circle cx="17" cy="9" r="3" /><path d="M22 19c0-2.6-2-4.6-4.6-4.9" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />,
};
const Icone = ({ nome, className = "size-[18px]" }: { nome: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONES[nome]}</svg>
);

function Kpi({ rotulo, valor, delta, deltaTxt, pct, cor, tile, icone, spark, id }: { rotulo: string; valor: string; delta?: number | null; deltaTxt: string; pct?: boolean; cor: string; tile: string; icone: string; spark: number[]; id: string }) {
  return (
    <div className="card grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 overflow-hidden p-4">
      <div className="min-w-0">
        <div className="text-xs font-medium text-mut">{rotulo}</div>
        <div className="my-0.5 text-[22px] font-semibold tracking-tight">{valor}</div>
        <div className="text-[11.5px] font-semibold">
          {delta == null ? <span className="font-medium text-mut-2">{deltaTxt}</span> : (
            <><span className={delta >= 0 ? "text-emerald-600" : "text-rose-600"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}{pct ? "%" : ""}</span><span className="ml-1 font-medium text-mut-2">{deltaTxt}</span></>
          )}
        </div>
      </div>
      <div className={`tile ${tile}`}><Icone nome={icone} /></div>
      <div className="col-span-2">{spark.length > 1 ? <Sparkline values={spark} color={cor} id={id} /> : <div className="h-[34px]" />}</div>
    </div>
  );
}

function Mini({ href, rotulo, valor, tile, icone }: { href?: string; rotulo: string; valor: string; tile: string; icone: string }) {
  const inner = (
    <>
      <div className={`tile ${tile}`}><Icone nome={icone} /></div>
      <div className="min-w-0"><div className="truncate text-xs text-mut">{rotulo}</div><div className="text-[18px] font-semibold tracking-tight">{valor}</div></div>
    </>
  );
  const cls = "card flex min-w-0 items-center gap-3 p-4";
  return href ? <Link href={href} className={`${cls} hover:border-brand-300`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

function Acao({ href, rotulo, tile, icone }: { href: string; rotulo: string; tile: string; icone: string }) {
  return (
    <Link href={href} className="grid gap-1.5 rounded-[10px] border border-line p-2.5 text-[11.5px] font-medium text-ink-2 hover:border-brand-300 hover:bg-brand-50/40">
      <span className={`tile size-7 rounded-lg ${tile}`}><Icone nome={icone} className="size-[15px]" /></span>{rotulo}
    </Link>
  );
}
