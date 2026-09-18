import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysCivil,
  computeAvailableDays,
  computeAvailableSlots,
  findHardConflicts,
  isSlotAvailable,
  mergeIntervals,
  slotLabel,
  subtractIntervals,
  type AvailabilityInput,
} from "../src/lib/availability";
import { dateTimeInTz } from "../src/lib/time";

const TZ = "America/Sao_Paulo";
const at = (date: string, time: string) => dateTimeInTz(date, time, TZ);
const labels = (slots: Date[]) => slots.map((s) => slotLabel(s, TZ));

// Terça 22/09/2026, "agora" = segunda 21/09 às 08:00 (SP).
const NOW = at("2026-09-21", "08:00");
const TUE = "2026-09-22";

function base(over: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    tz: TZ,
    rules: [
      { weekday: 2, startTime: "09:00", endTime: "12:00" },
      { weekday: 2, startTime: "14:00", endTime: "16:00" },
    ],
    exceptions: [],
    blocks: [],
    appointments: [],
    settings: { bufferMinutes: 10, slotStepMinutes: 30, minAdvanceHours: 0, maxBookingDaysAhead: 60, maxSessionsPerDay: null },
    durationMinutes: 50,
    now: NOW,
    ...over,
  };
}

describe("intervalos", () => {
  it("mescla sobrepostos e encostados", () => {
    const m = mergeIntervals([
      { start: at(TUE, "10:00"), end: at(TUE, "11:00") },
      { start: at(TUE, "09:00"), end: at(TUE, "10:00") },
      { start: at(TUE, "13:00"), end: at(TUE, "14:00") },
    ]);
    assert.equal(m.length, 2);
    assert.deepEqual(labels(m.map((i) => i.start)), ["09:00", "13:00"]);
  });

  it("subtrai buracos", () => {
    const r = subtractIntervals(
      [{ start: at(TUE, "09:00"), end: at(TUE, "12:00") }],
      [{ start: at(TUE, "10:00"), end: at(TUE, "10:30") }],
    );
    assert.deepEqual(
      r.map((i) => [slotLabel(i.start, TZ), slotLabel(i.end, TZ)]),
      [["09:00", "10:00"], ["10:30", "12:00"]],
    );
  });
});

describe("computeAvailableSlots", () => {
  it("gera slots alinhados ao passo que cabem na janela", () => {
    // 09:00–12:00 com 50min e passo 30: 09:00, 09:30, 10:00, 10:30, 11:00 (11:30+50 > 12:00)
    // 14:00–16:00: 14:00, 14:30, 15:00 (15:30+50 > 16:00)
    assert.deepEqual(labels(computeAvailableSlots(base(), TUE)), [
      "09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00",
    ]);
  });

  it("dia sem grade não tem slots", () => {
    assert.deepEqual(computeAvailableSlots(base(), "2026-09-23"), []); // quarta
  });

  it("exceção soma horários a um dia fora da grade", () => {
    const input = base({ exceptions: [{ date: "2026-09-26", startTime: "09:00", endTime: "11:00" }] }); // sábado
    assert.deepEqual(labels(computeAvailableSlots(input, "2026-09-26")), ["09:00", "09:30", "10:00"]);
  });

  it("sessão existente remove candidatos que colidem, considerando o buffer", () => {
    // Sessão 10:00–10:50, buffer 10 -> ocupado 09:50–11:00.
    // 09:00 (termina 09:50) ok; 09:30 (termina 10:20) colide; 10:00, 10:30 colidem; 11:00 ok.
    const input = base({ appointments: [{ start: at(TUE, "10:00"), end: at(TUE, "10:50") }] });
    assert.deepEqual(labels(computeAvailableSlots(input, TUE)), ["09:00", "11:00", "14:00", "14:30", "15:00"]);
  });

  it("bloqueio remove candidatos mas mantém a grade alinhada", () => {
    const input = base({ blocks: [{ start: at(TUE, "10:15"), end: at(TUE, "10:45") }] });
    // 09:00 ok (fim 09:50); 09:30 (fim 10:20) colide; 10:00, 10:30 colidem; 11:00 ok.
    assert.deepEqual(labels(computeAvailableSlots(input, TUE)), ["09:00", "11:00", "14:00", "14:30", "15:00"]);
  });

  it("bloqueio de dia inteiro zera o dia", () => {
    const input = base({ blocks: [{ start: at(TUE, "00:00"), end: at(TUE, "23:59") }] });
    assert.deepEqual(computeAvailableSlots(input, TUE), []);
  });

  it("respeita antecedência mínima", () => {
    // agora = terça 09:10, antecedência 1h -> só a partir de 10:10 -> 10:30 em diante
    const input = base({ now: at(TUE, "09:10"), settings: { ...base().settings, minAdvanceHours: 1 } });
    assert.deepEqual(labels(computeAvailableSlots(input, TUE)), ["10:30", "11:00", "14:00", "14:30", "15:00"]);
  });

  it("não oferece datas passadas nem além da janela", () => {
    const input = base({ settings: { ...base().settings, maxBookingDaysAhead: 7 } });
    assert.deepEqual(computeAvailableSlots(input, "2026-09-15"), []); // terça passada
    assert.deepEqual(computeAvailableSlots(input, "2026-10-06"), []); // terça daqui a 15 dias
    assert.ok(computeAvailableSlots(input, TUE).length > 0);
  });

  it("dia lotado (maxSessionsPerDay) não oferece nada", () => {
    const input = base({
      appointments: [
        { start: at(TUE, "09:00"), end: at(TUE, "09:50") },
        { start: at(TUE, "14:00"), end: at(TUE, "14:50") },
      ],
      settings: { ...base().settings, maxSessionsPerDay: 2 },
    });
    assert.deepEqual(computeAvailableSlots(input, TUE), []);
  });

  it("sessão de outro dia não afeta a contagem do dia", () => {
    const input = base({
      appointments: [{ start: at("2026-09-29", "09:00"), end: at("2026-09-29", "09:50") }],
      settings: { ...base().settings, maxSessionsPerDay: 1 },
    });
    assert.equal(computeAvailableSlots(input, TUE).length, 8);
  });

  it("duração maior reduz os encaixes", () => {
    const input = base({ durationMinutes: 80 });
    // 09:00–12:00: 09:00, 09:30, 10:00, 10:30 (10:30+80=11:50 ok; 11:00+80=12:20 não)
    // 14:00–16:00: 14:00 (14:30+80=15:50 ok também) -> 14:00, 14:30
    assert.deepEqual(labels(computeAvailableSlots(input, TUE)), ["09:00", "09:30", "10:00", "10:30", "14:00", "14:30"]);
  });
});

describe("computeAvailableDays / isSlotAvailable", () => {
  it("lista só os dias com algum slot", () => {
    const days = computeAvailableDays(base(), "2026-09-21", "2026-09-30");
    assert.deepEqual(days, ["2026-09-22", "2026-09-29"]);
  });

  it("isSlotAvailable aceita slot exato e rejeita desalinhado ou ocupado", () => {
    const input = base({ appointments: [{ start: at(TUE, "10:00"), end: at(TUE, "10:50") }] });
    assert.equal(isSlotAvailable(input, at(TUE, "09:00")), true);
    assert.equal(isSlotAvailable(input, at(TUE, "09:15")), false);
    assert.equal(isSlotAvailable(input, at(TUE, "10:00")), false);
  });
});

describe("findHardConflicts", () => {
  it("detecta colisão com sessão e bloqueio, ignorando buffer", () => {
    const appts = [{ id: "a1", start: at(TUE, "10:00"), end: at(TUE, "10:50") }];
    const blocks = [{ start: at(TUE, "15:00"), end: at(TUE, "16:00") }];
    // 09:10–10:00 encosta mas não colide
    assert.deepEqual(findHardConflicts({ start: at(TUE, "09:10"), end: at(TUE, "10:00") }, appts, blocks), { appointments: [], blocks: [] });
    assert.equal(findHardConflicts({ start: at(TUE, "10:30"), end: at(TUE, "11:20") }, appts, blocks).appointments.length, 1);
    assert.equal(findHardConflicts({ start: at(TUE, "15:30"), end: at(TUE, "16:20") }, appts, blocks).blocks.length, 1);
  });
});

describe("addDaysCivil", () => {
  it("cruza mês e ano", () => {
    assert.equal(addDaysCivil("2026-12-31", 1), "2027-01-01");
    assert.equal(addDaysCivil("2026-03-01", -1), "2026-02-28");
  });
});
