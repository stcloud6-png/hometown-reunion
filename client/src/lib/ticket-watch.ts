import type { Period } from "@/lib/reunion";

export const MIEVENTO_TICKETS_URL = "https://www.mieventos.com/event-multiple-detail/czr-2027";

/** MiEvento's usual per-order purchase cap. A lower limit means only that many are left. */
export const USUAL_PURCHASE_CAP = 10;

/** One row of the daily MiEvento snapshot (public.ticket_watch). */
export interface TicketWatchRow {
  watch_key: string;
  event_date: string; // ISO yyyy-mm-dd
  name: string;
  price: number | null;
  time_text: string | null;
  status: string; // available | sold_out | other
  status_label: string | null;
  max_qty: number | null;
  prev_status: string | null;
  prev_max_qty: number | null;
  sold_out_since: string | null;
  last_seen: string;
}

export interface TicketWatchRun {
  ran_at: string;
  ok: boolean;
  tickets: number | null;
  sold_out: number | null;
}

export type TicketLevel = "sold_out" | "low" | "available" | "other";

export function ticketLevel(t: TicketWatchRow): TicketLevel {
  if (t.status === "sold_out") return "sold_out";
  if (t.status !== "available") return "other";
  if (t.max_qty != null && t.max_qty < USUAL_PURCHASE_CAP) return "low";
  return "available";
}

export function ticketBadgeText(t: TicketWatchRow): string {
  switch (ticketLevel(t)) {
    case "sold_out":
      return "Sold out";
    case "low":
      return `Only ${t.max_qty} left`;
    case "available":
      return "Available";
    default:
      return t.status_label || "Not on sale";
  }
}

export const LEVEL_CLASS: Record<TicketLevel, string> = {
  sold_out: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900",
  low: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
  available: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  other: "bg-muted text-muted-foreground border-border",
};

const LEVEL_ORDER: Record<TicketLevel, number> = { sold_out: 0, low: 1, other: 2, available: 3 };

/** Keep only rows from the latest snapshot (a ticket MiEvento removed stops showing). */
export function latestTickets(rows: TicketWatchRow[]): TicketWatchRow[] {
  if (rows.length === 0) return [];
  const latest = rows.reduce((m, r) => (r.last_seen > m ? r.last_seen : m), rows[0].last_seen);
  const cutoff = new Date(latest).getTime() - 6 * 3600_000;
  return rows.filter((r) => new Date(r.last_seen).getTime() >= cutoff);
}

export function sortByUrgency(rows: TicketWatchRow[]): TicketWatchRow[] {
  return [...rows].sort(
    (a, b) =>
      LEVEL_ORDER[ticketLevel(a)] - LEVEL_ORDER[ticketLevel(b)] ||
      (ticketLevel(a) === "low" ? (a.max_qty ?? 0) - (b.max_qty ?? 0) : 0) ||
      a.event_date.localeCompare(b.event_date) ||
      a.name.localeCompare(b.name),
  );
}

export function ticketSummary(rows: TicketWatchRow[]) {
  const counts = { sold_out: 0, low: 0, available: 0, other: 0 } as Record<TicketLevel, number>;
  for (const r of rows) counts[ticketLevel(r)] += 1;
  return counts;
}

/** Short display name: drops the "(Weekday)" prefix MiEvento adds. */
export function shortTicketName(t: TicketWatchRow): string {
  return t.name.replace(/\s+/g, " ").trim();
}

/** Clock time for display, e.g. "8am–1:30pm", pulled from MiEvento's description line. */
export function ticketTimeLabel(t: TicketWatchRow): string | null {
  const range = parseTimeRange(t.time_text);
  if (!range) return null;
  const raw = (t.time_text ?? "").match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (raw) return `${raw[1].replace(/\s+/g, "")}–${raw[2].replace(/\s+/g, "")}`;
  const single = (t.time_text ?? "").match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  return single ? single[1].replace(/\s+/g, "") : null;
}

function toHours(clock: string, fallbackMeridiem?: string): number | null {
  const m = clock.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  const mer = m[3] ?? fallbackMeridiem;
  if (mer === "pm") h += 12;
  return h + (m[2] ? Number(m[2]) / 60 : 0);
}

/** Start/end hour (0–24+) parsed from text like "8am-1:30pm", "12:30-5pm", "8pm-12am", "- 9am". */
export function parseTimeRange(text: string | null | undefined): { start: number; end: number } | null {
  if (!text) return null;
  const range = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(am|pm))/i);
  if (range) {
    const endMer = range[3].toLowerCase();
    let start = toHours(range[1], undefined);
    const end0 = toHours(range[2]);
    if (end0 == null) return null;
    if (start == null || !/am|pm/i.test(range[1])) {
      // "12:30-5pm" → start shares the end's meridiem unless that would put it after the end.
      start = toHours(range[1].replace(/\s*(am|pm)/i, ""), endMer);
      if (start != null && start > end0) start = toHours(range[1].replace(/\s*(am|pm)/i, ""), "am");
    }
    if (start == null) return null;
    let end = end0;
    if (end <= start) end += 24; // runs past midnight
    return { start, end };
  }
  const single = text.match(/(\d{1,2}(?::\d{2})?\s*(am|pm))/i);
  if (single) {
    const start = toHours(single[1]);
    if (start == null) return null;
    return { start, end: start + 3 };
  }
  return null;
}

const PERIOD_WINDOW: Record<Period, [number, number]> = { m: [5, 12], a: [12, 17], e: [17, 30] };

/** Periods a ticket overlaps on its day (falls back to all three when no time is given). */
export function ticketPeriods(t: TicketWatchRow): Period[] {
  const r = parseTimeRange(t.time_text);
  if (!r) return ["m", "a", "e"];
  return (Object.keys(PERIOD_WINDOW) as Period[]).filter((p) => {
    const [s, e] = PERIOD_WINDOW[p];
    return r.start < e && r.end > s && Math.min(r.end, e) - Math.max(r.start, s) > 1;
  });
}

export function ticketsForSlot(rows: TicketWatchRow[], iso: string, period: Period): TicketWatchRow[] {
  return sortByUrgency(rows.filter((t) => t.event_date === iso && ticketPeriods(t).includes(period)));
}

export function formatTicketDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatCheckedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Demo snapshot for stub mode (mirrors the Oct 4, 2026 MiEvento page). */
export const DEMO_TICKETS: TicketWatchRow[] = (
  [
    ["2027-01-17", "Southbound Panama Canal Partial Transit", 145, "9am-5pm", "available", 10],
    ["2027-01-18", "Gold Coast Bus Tour (Atlantic Side)", 90, "8am-5pm", "available", 7],
    ["2027-01-19", "Family Day Gatun Lake & Chagres River Cruise", 50, "8am-12pm", "available", 6],
    ["2027-01-19", "Carimañola Cooking Class", 40, "11:30am - 2:30pm", "available", 2],
    ["2027-01-19", "Reprosa Workshop Bus Tour", 25, "12:30pm-3:30pm", "sold_out", null],
    ["2027-01-20", "Summit Gardens Adventure Bus Tour", 35, "8am-1:30pm", "sold_out", null],
    ["2027-01-20", "El Prado Walking Tour", 25, "8:30am-10:30am", "available", 10],
    ["2027-01-20", "VIP Bay Cruise", 75, "7pm-10pm", "sold_out", null],
    ["2027-01-24", "Taboga Island Cruise", 90, "10am-4pm", "available", 9],
  ] as const
).map(([event_date, name, price, time, status, max]) => ({
  watch_key: `${event_date}|${name}`,
  event_date,
  name,
  price,
  time_text: time,
  status,
  status_label: status === "sold_out" ? "Sold Out" : "Available",
  max_qty: max,
  prev_status: null,
  prev_max_qty: null,
  sold_out_since: null,
  last_seen: "2026-10-05T02:34:53Z",
}));
