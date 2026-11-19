/**
 * Class events: the single list behind the post-login "events grid".
 *
 * - One row per live MiEvento listing (from the daily ticket_watch snapshot), mapped onto
 *   the calendar's stable event ids so labels and slot colours keep working everywhere.
 * - Plus the two BHS '87 class events: the Yacht Club dinner (Wed 20 evening) and the
 *   Napoli lunch (Wed 20 afternoon).
 * - Timeslots: the day is still Morning / Afternoon / Evening. An event blocks the slots in
 *   its calendar rule (SCHEDULED_EVENTS.autoSlots). New listings with no rule block every slot
 *   they overlap by more than an hour, and always at least one.
 * - Two picked events clash when they share a day and a slot.
 */
import {
  PERIODS, SCHEDULED_EVENTS,
  type Period, type PersonSlots, type ScheduledEvent,
} from "@/lib/reunion";
import { parseTimeRange, ticketLevel, ticketTimeLabel, type TicketWatchRow } from "@/lib/ticket-watch";

export type EventAnswer = "planning" | "purchased";
export type EventAnswers = Record<string, EventAnswer>;
export type YachtStatus = "planning" | "paid" | "not_attending";

export const YACHT_KEY = "yacht-club";
export const NAPOLI_KEY = "napoli-lunch-20";

export interface ClassEvent {
  /** Stable key = calendar event id (e.g. "golf-21"), or "mv:<watch_key>" for an unmapped new listing. */
  key: string;
  date: string;
  name: string;
  timeLabel: string | null;
  price: number | null;
  periods: Period[];
  kind: "mievento" | "class";
  /** Can only be marked "planning" (Napoli: no ticket). */
  planOnly: boolean;
  soldOut: boolean;
  lowStock: number | null;
}

/** MiEvento listing -> calendar event id. Matched by date + a name pattern. */
const MAP: { date: string; re: RegExp; id: string }[] = [
  { date: "2027-01-17", re: /partial transit/i, id: "transit-17" },
  { date: "2027-01-18", re: /gold coast/i, id: "gold-coast-18" },
  { date: "2027-01-18", re: /chichipati/i, id: "chichipati-18" },
  { date: "2027-01-18", re: /ancon/i, id: "move-ancon-18" },
  { date: "2027-01-19", re: /^family day gatun|chagres/i, id: "gatun-cruise-19" },
  { date: "2027-01-19", re: /chichipati/i, id: "gatun-fishing-19" },
  { date: "2027-01-19", re: /reprosa/i, id: "reprosa-19" },
  { date: "2027-01-19", re: /prado/i, id: "prado-19" },
  { date: "2027-01-19", re: /carima/i, id: "carimanola-19" },
  { date: "2027-01-20", re: /prado/i, id: "prado-20" },
  { date: "2027-01-20", re: /summit/i, id: "summit-20" },
  { date: "2027-01-20", re: /sprague/i, id: "sprague-20" },
  { date: "2027-01-20", re: /miraflores/i, id: "miraflores-20" },
  { date: "2027-01-20", re: /chiva/i, id: "chiva-20" },
  { date: "2027-01-20", re: /bay cruise/i, id: "vip-bay-cruise-20" },
  { date: "2027-01-21", re: /golf/i, id: "golf-21" },
  { date: "2027-01-21", re: /reprosa/i, id: "reprosa-21" },
  { date: "2027-01-21", re: /museum/i, id: "museums-21" },
  { date: "2027-01-21", re: /miraflores|locks/i, id: "locks-21" },
  { date: "2027-01-21", re: /chicken/i, id: "chicken-21" },
  { date: "2027-01-22", re: /dome/i, id: "dome-car-22" },
  { date: "2027-01-22", re: /railway/i, id: "railway-22" },
  { date: "2027-01-22", re: /partial transit/i, id: "transit-22" },
  { date: "2027-01-22", re: /p[ií]n\s*d[ií]ng/i, id: "pin-ding-22" },
  { date: "2027-01-23", re: /jamboree/i, id: "jamboree-23" },
  { date: "2027-01-23", re: /mega bay cruise/i, id: "mega-cruise-23" },
  { date: "2027-01-23", re: /causeway/i, id: "move-causeway-23" },
  { date: "2027-01-24", re: /taboga/i, id: "taboga-24" },
];

const SCHEDULED_BY_ID = new Map<string, ScheduledEvent>(SCHEDULED_EVENTS.map((e) => [e.id, e]));

export function calendarIdForTicket(t: Pick<TicketWatchRow, "event_date" | "name">): string | null {
  return MAP.find((m) => m.date === t.event_date && m.re.test(t.name))?.id ?? null;
}

const PERIOD_WINDOW: Record<Period, [number, number]> = { m: [5, 12], a: [12, 17], e: [17, 30] };

/** Slots a clock-time range blocks: every slot overlapped by more than an hour, and at least one. */
export function periodsForTimeText(text: string | null | undefined): Period[] {
  const r = parseTimeRange(text);
  if (!r) return ["m", "a", "e"];
  const overlap = (p: Period) => {
    const [s, e] = PERIOD_WINDOW[p];
    return Math.min(r.end, e) - Math.max(r.start, s);
  };
  const hit = PERIODS.filter((p) => overlap(p) > 1);
  if (hit.length) return hit;
  return [PERIODS.reduce((best, p) => (overlap(p) > overlap(best) ? p : best), PERIODS[0])];
}

const YACHT_EVENT: ClassEvent = {
  key: YACHT_KEY, date: "2027-01-20", name: "Yacht Club '87 Dinner/Dance", timeLabel: "Evening",
  price: null, periods: ["e"], kind: "class", planOnly: false, soldOut: false, lowStock: null,
};
const NAPOLI_EVENT: ClassEvent = {
  key: NAPOLI_KEY, date: "2027-01-20", name: "Napoli Lunch (BHS '87)", timeLabel: "Afternoon",
  price: null, periods: ["a"], kind: "class", planOnly: true, soldOut: false, lowStock: null,
};

export function yachtEvent(): ClassEvent { return YACHT_EVENT; }

/** The grid rows: live MiEvento listings by date/time, then Napoli last. (Yacht has its own gate.) */
export function buildClassEvents(tickets: TicketWatchRow[]): ClassEvent[] {
  const rows: ClassEvent[] = [];
  const seen = new Set<string>();
  for (const t of tickets) {
    const id = calendarIdForTicket(t);
    const key = id ?? `mv:${t.watch_key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const level = ticketLevel(t);
    const free = (t.price ?? 0) === 0;
    rows.push({
      key,
      date: t.event_date,
      name: t.name.replace(/\s+/g, " ").trim(),
      timeLabel: ticketTimeLabel(t),
      price: t.price,
      periods: (id && SCHEDULED_BY_ID.get(id)?.autoSlots) || periodsForTimeText(t.time_text),
      kind: "mievento",
      planOnly: false,
      soldOut: level === "sold_out",
      // Free events are capped at 1 per order by MiEvento; that isn't scarcity.
      lowStock: level === "low" && !free ? t.max_qty : null,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || startHour(a) - startHour(b) || a.name.localeCompare(b.name));
  rows.push(NAPOLI_EVENT);
  return rows;
}

function startHour(e: ClassEvent): number {
  return parseTimeRange(e.timeLabel)?.start ?? PERIODS.indexOf(e.periods[0]) * 6 + 6;
}

// ---------------------------------------------------------------------------
// Rules for the two columns
// ---------------------------------------------------------------------------

export interface Choice { key: string; answer: EventAnswer }

/** Everything the person currently has picked, Yacht included (unless "can't make it"). */
export function pickedEvents(answers: EventAnswers, yacht: YachtStatus | null, catalog: ClassEvent[]): { event: ClassEvent; answer: EventAnswer }[] {
  const out: { event: ClassEvent; answer: EventAnswer }[] = [];
  if (yacht === "planning" || yacht === "paid") out.push({ event: YACHT_EVENT, answer: yacht === "paid" ? "purchased" : "planning" });
  for (const [key, answer] of Object.entries(answers)) {
    const event = catalog.find((e) => e.key === key);
    if (event) out.push({ event, answer });
  }
  return out;
}

export function clashesWith(a: ClassEvent, b: ClassEvent): Period[] {
  if (a.key === b.key || a.date !== b.date) return [];
  return a.periods.filter((p) => b.periods.includes(p));
}

const PERIOD_WORD: Record<Period, string> = { m: "morning", a: "afternoon", e: "evening" };
const dayFmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export interface CheckResult {
  allowed: boolean;
  /** Shown next to the box straight away. */
  reason?: string;
  /** Allowed, but worth saying (two tickets already bought for the same slot). */
  warning?: string;
}

export interface CheckContext {
  answers: EventAnswers;
  yacht: YachtStatus | null;
  catalog: ClassEvent[];
  arrival: string;
  departure: string;
}

/** Can this box be ticked? Explains why not. */
export function checkChoice(event: ClassEvent, answer: EventAnswer, ctx: CheckContext): CheckResult {
  if (event.date < ctx.arrival || event.date > ctx.departure) {
    return { allowed: false, reason: `You're not in Panama on ${dayFmt(event.date)} (your dates are ${dayFmt(ctx.arrival)} – ${dayFmt(ctx.departure)}).` };
  }
  if (answer === "purchased" && event.planOnly) return { allowed: false, reason: "No ticket needed for this one — just tick “Plan to attend”." };
  if (answer === "planning" && event.soldOut) {
    return { allowed: false, reason: "Sold out on MiEvento. Only tick “Have my ticket” if you already bought one." };
  }
  const others = pickedEvents(ctx.answers, ctx.yacht, ctx.catalog).filter((p) => p.event.key !== event.key);
  for (const other of others) {
    const shared = clashesWith(event, other.event);
    if (!shared.length) continue;
    const when = `${dayFmt(event.date)} ${shared.map((p) => PERIOD_WORD[p]).join(" & ")}`;
    if (answer === "purchased" && other.answer === "purchased") {
      return { allowed: true, warning: `Heads up: you also have a ticket for ${other.event.name} (${when}). You can't be at both.` };
    }
    const fix = other.event.key === YACHT_KEY ? "change your Yacht Club answer first" : `untick ${other.event.name} first`;
    return { allowed: false, reason: `Clashes with ${other.event.name} (${when}). You can't be in two places at once — ${fix}.` };
  }
  return { allowed: true };
}

/** Toggle a box. Returns the new answers, or the reason it was refused. */
export function toggleChoice(event: ClassEvent, answer: EventAnswer, ctx: CheckContext): { answers: EventAnswers; result: CheckResult } {
  const current = ctx.answers[event.key];
  if (current === answer) {
    const next = { ...ctx.answers };
    delete next[event.key];
    return { answers: next, result: { allowed: true } };
  }
  const result = checkChoice(event, answer, { ...ctx, answers: omit(ctx.answers, event.key) });
  if (!result.allowed) return { answers: ctx.answers, result };
  return { answers: { ...ctx.answers, [event.key]: answer }, result };
}

function omit<T extends object>(o: T, k: string): T {
  const next = { ...o } as Record<string, unknown>;
  delete next[k];
  return next as T;
}

// ---------------------------------------------------------------------------
// Calendar sync
// ---------------------------------------------------------------------------

/** Tag written into a busy slot for a grid event. */
export function slotTagFor(event: ClassEvent): string { return event.key; }

/**
 * Fill the calendar from the grid. Slots belonging to grid events that are no longer picked
 * go back to Available; picked events take their slots. Everything else is left alone.
 */
export function applyAnswersToSlots(slots: PersonSlots, answers: EventAnswers, catalog: ClassEvent[], arrival: string, departure: string): PersonSlots {
  const next: PersonSlots = Object.fromEntries(Object.entries(slots).map(([d, p]) => [d, { ...p }]));
  const gridKeys = new Set(catalog.map((e) => e.key));
  for (const [day, periods] of Object.entries(next)) {
    for (const p of PERIODS) {
      const v = periods[p];
      if (v?.s === "busy" && v.t && gridKeys.has(v.t) && !answers[v.t]) periods[p] = { s: "ok" };
    }
  }
  for (const event of catalog) {
    if (!answers[event.key] || event.date < arrival || event.date > departure || !next[event.date]) continue;
    for (const p of event.periods) {
      next[event.date][p] = { s: "busy", t: slotTagFor(event) };
    }
  }
  return next;
}

/**
 * The other direction: if a calendar edit took a grid event off all of its slots, untick it.
 * Returns the keys that were dropped so the UI can say so.
 */
export function answersAfterCalendarEdit(slots: PersonSlots, answers: EventAnswers, catalog: ClassEvent[]): { answers: EventAnswers; dropped: ClassEvent[] } {
  const dropped: ClassEvent[] = [];
  const next = { ...answers };
  for (const event of catalog) {
    if (!next[event.key]) continue;
    const still = event.periods.some((p) => slots[event.date]?.[p]?.s === "busy" && slots[event.date]?.[p]?.t === event.key);
    if (!still) { delete next[event.key]; dropped.push(event); }
  }
  return { answers: next, dropped };
}

/** Yacht answer -> the evening slot on Wed 20. */
export function applyYachtToSlots(slots: PersonSlots, yacht: YachtStatus | null): PersonSlots {
  const day = YACHT_EVENT.date;
  if (!slots[day]) return slots;
  const next: PersonSlots = { ...slots, [day]: { ...slots[day] } };
  if (yacht === "planning" || yacht === "paid") next[day].e = { s: "busy", t: YACHT_KEY };
  else if (next[day].e?.t === YACHT_KEY) next[day].e = { s: "ok" };
  return next;
}

/** "2027-01-21:e" style ids for a person's Available + Maybe slots (for the pill timeslot picker). */
export function openSlots(slots: PersonSlots, arrival: string, departure: string): string[] {
  const out: string[] = [];
  for (const day of Object.keys(slots).sort()) {
    if (day < arrival || day > departure) continue;
    for (const p of PERIODS) {
      const s = slots[day]?.[p]?.s;
      if (s === "ok" || s === "maybe") out.push(`${day}:${p}`);
    }
  }
  return out;
}

export function slotIdLabel(id: string): string {
  const [day, p] = id.split(":");
  return `${dayFmt(day)} ${PERIOD_WORD[p as Period]}`;
}
