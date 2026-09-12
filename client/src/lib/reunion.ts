// CZR BHS87 Reunion — core data model, date/schedule logic, Supabase REST client,
// and CSV export. This mirrors the behavior of the live reference site at
// https://czr-bhs87-reunion.vercel.app, reconstructed from its production bundle
// and its actual Supabase schema (project esfwaptssbqueayefvrj).
//
// Architecture note: this app talks directly to Supabase's REST endpoints from
// the browser using the public anon key. That is safe because every table has
// Row Level Security enabled — anonymous visitors can select/insert into
// `people`, and can only update/delete rows whose `email` matches their signed-in
// email claim (case-insensitively). There is no custom Express API for data.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Period = "m" | "a" | "e";
export type SlotStatus = "ok" | "maybe" | "busy" | "private" | "pool-day";

export interface SlotValue {
  s: SlotStatus;
  /** Present when s === "busy": the scheduled-event id (or "czr-<activityId>" for a group-planned sub-event) this slot is tied to. */
  t?: string;
}

export type DaySlots = Partial<Record<Period, SlotValue>>;
export type PersonSlots = Record<string, DaySlots>; // keyed by ISO date

export interface Person {
  id?: string;
  name: string;
  email?: string | null;
  arrival: string; // ISO date
  departure: string; // ISO date
  slots: PersonSlots;
  interests: string[];
  attending?: boolean | null; // Ticket-check: true = "Count me in", false = "Not sure yet", null = unanswered
  volunteer_support?: boolean | null;
  volunteer_lead?: boolean | null;
  yacht_paid?: boolean | null;
  mievento_intents?: Record<string, string> | null;
  /** Per sub-event ticket status for the 4 "tickets coming soon" MiEvento events (keyed by ScheduledEvent id), e.g. `{ "mega-cruise-23": { status: "purchased" } }`. */
  mievento_ticket_status?: Record<string, MieventoTicketEntry> | null;
  updated_at?: string;
}

export type MieventoTicketStatusValue = "not_registered" | "researching" | "purchased";

export interface MieventoTicketEntry {
  status: MieventoTicketStatusValue;
  /** Optional free text: "is there any other info that would help you decide to go?" */
  note?: string;
}

export interface Activity {
  id: string;
  label: string;
  suggested_by?: string | null;
}

export interface ScheduledEvent {
  id: string;
  label: string;
  note?: string;
  days: string[];
  autoSlots?: Period[];
  blue?: boolean;
  soft?: boolean;
  soon?: boolean;
}

export interface ClusterResource {
  id?: string;
  activity_id: string;
  label: string;
  url: string;
  suggested_by?: string | null;
  created_at?: string;
}

export interface ClusterLead {
  id?: number;
  activity_id: string;
  lead_name: string;
  lead_email?: string | null;
  created_at?: string;
}

export type EventPlanStatus = "open" | "full" | "cancelled";

export interface EventPlan {
  id?: number;
  activity_id: string;
  status: EventPlanStatus;
  event_date?: string | null;
  start_time?: string | null;
  venue?: string | null;
  max_size?: number | null;
  cost?: string | null;
  notes?: string | null;
  updated_by?: string | null;
  updated_at?: string;
}

export interface DayInfo {
  iso: string;
  weekday: string;
  label: string;
  short: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const START_DATE = "2027-01-09";
export const END_DATE = "2027-01-30";
export const MIEVENTO_START = "2027-01-17";
export const MIEVENTO_END = "2027-01-24";
export const EXPECTED_HEADCOUNT = 62;

export const PERIODS: Period[] = ["m", "a", "e"];
export const PERIOD_LABEL: Record<Period, string> = { m: "Morning", a: "Afternoon", e: "Evening" };
export const PERIOD_SHORT: Record<Period, string> = { m: "AM", a: "PM", e: "EVE" };

export const STATUSES: SlotStatus[] = ["ok", "maybe", "busy", "private"];
/** Long labels, used in the CSV export and legend. */
export const STATUS_LABEL: Record<SlotStatus, string> = {
  ok: "Available",
  maybe: "Possibly available",
  busy: "Existing event",
  private: "Private / unavailable",
  "pool-day": "Drinking All Day at the Pool",
};
/** Compact labels used in the slot grid itself (busy is overridden by mieventoOrEventLabel()). */
export const STATUS_SHORT: Record<SlotStatus, string> = {
  ok: "Available",
  maybe: "Maybe",
  busy: "MiEvento",
  private: "Private",
  "pool-day": "Drinking All Day at the Pool",
};

/** Shoulder days: outside the core MiEvento window, on either end of the trip. */
const SHOULDER_START: string[] = [
  "2027-01-09", "2027-01-10", "2027-01-11", "2027-01-12",
  "2027-01-13", "2027-01-14", "2027-01-15", "2027-01-16",
];
const SHOULDER_END: string[] = [
  "2027-01-25", "2027-01-26", "2027-01-27", "2027-01-28", "2027-01-29", "2027-01-30",
];

/** Dates eligible for the open-ended "Drinking All Day at the Pool" commitment. */
const POOL_DAY_DATES: string[] = [
  "2027-01-13", "2027-01-14", "2027-01-15", "2027-01-16", "2027-01-17", "2027-01-18",
  "2027-01-19", "2027-01-20", "2027-01-21", "2027-01-22", "2027-01-23", "2027-01-24",
  "2027-01-25", "2027-01-26", "2027-01-27",
];

/** The Yacht Club dinner/dance is locked onto every new entry: Wed Jan 20, evening. */
const YACHT_LOCK = { iso: "2027-01-20", slot: "e" as Period, tag: "yacht-club" };

export interface ClusterThresholds {
  publicTop: number;
  publicMinInterest: number;
  candidateAt: number;
  spinoffAt: number;
}

/** Fallback defaults, used until the shared `app_settings` row loads (or when stubbed). */
export const CLUSTER_THRESHOLDS: ClusterThresholds = {
  publicTop: 2,
  publicMinInterest: 6,
  candidateAt: 10,
  spinoffAt: 20,
};

/** Baseline interest/activity pills (BHS87-only activities the group can organize). */
export const BASE_ACTIVITIES: Activity[] = [
  { id: "napoli", label: "Napoli Restaurant" },
  { id: "casino", label: "Casino Night" },
  { id: "deep-sea-fishing", label: "Charter Deep-Sea Fishing but send catch to restaurant" },
  { id: "coronado", label: "Coronado Beach" },
  { id: "cruise-87", label: "Chiva 87" },
  { id: "railway-87", label: "Exclusive Railway for 87" },
  { id: "escape-room", label: "Escape Room" },
  { id: "hiking", label: "Hiking" },
  { id: "scuba-diving", label: "Scuba Diving" },
  { id: "sky-diving", label: "Sky Diving" },
  { id: "shopping", label: "Shopping" },
  { id: "karaoke", label: "Karaoke" },
  { id: "bay-cruise-87", label: "Bay Cruise Exclusive for 87" },
  { id: "golf", label: "Another Golf Day exclusive for 87" },
  { id: "bowling", label: "Bowling" },
  { id: "chicken-coup", label: "Chicken coup" },
  { id: "pin-ding", label: "Exclusive 87 Ping Ding" },
  { id: "poolside-87", label: "Exclusive Poolside for 87" },
  { id: "jog-amador-causeway", label: "Jog Amador Causeway" },
  { id: "pickleball", label: "Pickleball" },
  { id: "rooftop-dinner-casco", label: "Rooftop dinner casco" },
  { id: "tennis-doubles", label: "Tennis doubles" },
];

/** Typical time-of-day for an activity, used to auto-slot a group-planned sub-event. */
const ACTIVITY_TIME_OF_DAY: Record<string, "evening" | "day" | "any"> = {
  napoli: "evening",
  casino: "evening",
  "cruise-87": "evening",
  karaoke: "evening",
  "pin-ding": "evening",
  "rooftop-dinner-casco": "evening",
  "coffee-house": "evening",
  coronado: "day",
  "deep-sea-fishing": "day",
  "railway-87": "day",
  hiking: "day",
  "scuba-diving": "day",
  "sky-diving": "day",
  shopping: "day",
  "bay-cruise-87": "day",
  "jog-amador-causeway": "day",
  "tennis-doubles": "day",
  golf: "day",
  bowling: "any",
  "escape-room": "any",
  "chicken-coup": "any",
  "poolside-87": "any",
  pickleball: "day",
};

function activityTimeOfDay(activityId: string): "evening" | "day" | "any" {
  return ACTIVITY_TIME_OF_DAY[activityId] ?? "any";
}

function autoSlotsForTimeOfDay(tod: "evening" | "day" | "any"): Period[] {
  return tod === "evening" ? ["e"] : tod === "day" ? ["m", "a"] : ["m", "a", "e"];
}

/** The full locked/scheduled events calendar (immutable — organizers manage this list, not attendees). */
export const SCHEDULED_EVENTS: ScheduledEvent[] = [
  { id: "yacht-club", label: "Yacht Club 87 Dinner/Dance", note: "Wed 20 evening", days: ["2027-01-20"] },
  { id: "bocas", label: "Bocas Del Toro", days: SHOULDER_START },
  { id: "vulcan", label: "Vulcan", days: SHOULDER_START },
  { id: "cerro-punta", label: "Cerro Punta", days: SHOULDER_START },
  { id: "boquette", label: "Boquette", days: SHOULDER_START },
  { id: "transit-17", label: "Southbound Partial Transit", note: "Sun 17 morning & afternoon", days: ["2027-01-17"], autoSlots: ["m", "a"], blue: true },
  { id: "gold-coast-18", label: "Gold Coast Bus", note: "Mon 18 morning & afternoon", days: ["2027-01-18"], autoSlots: ["m", "a"], blue: true },
  { id: "chichipati-18", label: "Chichipati Fishing", note: "Mon 18, 6am-4pm", days: ["2027-01-18"], autoSlots: ["m", "a"], soft: true },
  { id: "gatun-fishing-19", label: "Gatun Fishing", note: "Tue 19 morning & afternoon", days: ["2027-01-19"], autoSlots: ["m", "a"] },
  { id: "gatun-cruise-19", label: "Family Gatun Cruise", note: "Tue 19 morning & afternoon", days: ["2027-01-19"], autoSlots: ["m", "a"], blue: true },
  { id: "reprosa-19", label: "Reprosa", note: "Tue 19, 12:30-3:30pm", days: ["2027-01-19"], autoSlots: ["a"], soft: true },
  { id: "prado-19", label: "El Prado/BHS Tour", note: "Tue 19 morning", days: ["2027-01-19"], autoSlots: ["m"] },
  { id: "prado-20", label: "El Prado/BHS Tour", note: "Wed 20 morning", days: ["2027-01-20"], autoSlots: ["m"], blue: true },
  { id: "summit-20", label: "Summit Gardens", note: "Wed 20, 8am-1:30pm", days: ["2027-01-20"], autoSlots: ["m", "a"], soft: true },
  { id: "sprague-20", label: "Sprague Art", note: "Wed 20, 10:30-3:30pm", days: ["2027-01-20"], autoSlots: ["m", "a"], soft: true },
  { id: "miraflores-20", label: "Miraflores Locks", note: "Wed 20, 11am-4pm", days: ["2027-01-20"], autoSlots: ["m", "a"], soft: true },
  { id: "golf-21", label: "Golf Tournament", note: "Thu 21, 8am-2pm", days: ["2027-01-21"], autoSlots: ["m", "a"] },
  { id: "reprosa-21", label: "Reprosa Tour", note: "Thu 21, 8:30-11:30am", days: ["2027-01-21"], autoSlots: ["m"] },
  { id: "museums-21", label: "Museums Tour", note: "Thu 21, 12:30-5pm", days: ["2027-01-21"], autoSlots: ["a"] },
  { id: "locks-21", label: "Locks Tour", note: "Thu 21, 12:30-5pm", days: ["2027-01-21"], autoSlots: ["a"] },
  { id: "chicken-21", label: "Midnite Chicken Coop", note: "Thu 21, 8pm-12am", days: ["2027-01-21"], autoSlots: ["e"] },
  { id: "railway-22", label: "Railway", note: "Fri 22 morning & afternoon — tickets coming soon", days: ["2027-01-22"], autoSlots: ["m", "a"], blue: true, soon: true },
  { id: "transit-22", label: "Southbound Partial Transit", note: "Fri 22, 9am-5pm", days: ["2027-01-22"], autoSlots: ["m", "a"] },
  { id: "pin-ding-22", label: "CZR PÍN DÍNG", note: "Fri 22, 8pm-1am", days: ["2027-01-22"], autoSlots: ["e"] },
  { id: "dome-car-22", label: "Railroad Dome Car", note: "Fri 22 morning — tickets coming soon, space limited", days: ["2027-01-22"], autoSlots: ["m"], blue: true, soon: true },
  { id: "coffee-house-19", label: "Coffee House 2027", note: "Tue 19 evening — tickets coming soon", days: ["2027-01-19"], autoSlots: ["e"], blue: true, soon: true },
  { id: "mega-cruise-23", label: "MEGA Cruise", note: "Sat 23 evening — tickets coming soon", days: ["2027-01-23"], autoSlots: ["e"], blue: true, soon: true },
  { id: "jamboree-23", label: "Jamboree", note: "Sat 23, 10am-6pm", days: ["2027-01-23"], autoSlots: ["m", "a"] },
  { id: "taboga-24", label: "Taboga Island", note: "Sun 24 all day", days: ["2027-01-24"], autoSlots: ["m", "a", "e"], blue: true },
  { id: "coronado-25", label: "Coronado Beach", days: SHOULDER_END },
  { id: "el-valle-26", label: "El Valle", days: SHOULDER_END },
  { id: "pool-day", label: "Drinking All Day at the Pool", days: POOL_DAY_DATES },
  // Applies to every shoulder date (both ends of the trip) but never during the
  // core Jan 17–24 MiEvento window — see the period filter in eventsForDate().
  { id: "other", label: "Other commitment", note: "", days: [...SHOULDER_START, ...SHOULDER_END] },
];

const EVENT_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  SCHEDULED_EVENTS.map((e) => [e.id, e.label]),
);

/** Curated venue/booking links per activity id, shown under each interest cluster. */
export const CLUSTER_RESOURCE_LINKS: Record<string, { label: string; url: string }[]> = {
  napoli: [
    { label: "Napoli Pizzeria 1 — TripAdvisor (reviews, photos, contact)", url: "https://www.tripadvisor.com/Restaurant_Review-g294480-d3578995-Reviews-Napoli_Pizzeria_1-Panama_City_Panama_Province.html" },
  ],
  "cruise-87": [
    { label: "Chiva Parrandera Tours — Private Chiva Hire", url: "https://chivaparranderatours.com/private-chiva-hire/" },
  ],
  "railway-87": [
    { label: "Panama Canal Tours — Railway packages", url: "https://panamacanal.tours/packages/railway" },
  ],
  "rooftop-dinner-casco": [
    { label: "CasaCasco — OpenTable (rooftop dining reservations)", url: "https://www.opentable.com/r/casacasco-panama" },
  ],
  "deep-sea-fishing": [
    { label: "Pescaya — charter listing & booking", url: "https://pescaya.com/en/listing_details/62?booking_days=1&booking_persons=1&booking_children=0&booking_date=&orderby=review" },
  ],
  coronado: [
    { label: "Coronado Luxury Club & Suites — Beach Club Day Pass (meals & drinks incl.)", url: "https://www.coronadoluxurysuites.com/en/day-pass-club/" },
    { label: "Hotel Coronado Thalasso & Spa — Day Pass", url: "https://www.hotelcoronado.com/de/day-pass.html" },
  ],
};

export const EVENT_PLAN_STATUS_LABEL: Record<EventPlanStatus, string> = {
  open: "Open",
  full: "Max capacity reached",
  cancelled: "Cancelled",
};

/** Per-day interest level a person can declare for the core MiEvento week (Jan 17–24). */
export type MieventoIntent = "very" | "somewhat" | "skip";
export const MIEVENTO_INTENTS: MieventoIntent[] = ["very", "somewhat", "skip"];
export const MIEVENTO_INTENT_LABEL: Record<MieventoIntent, string> = {
  very: "Very interested",
  somewhat: "Somewhat interested",
  skip: "Not this year",
};

/** The core MiEvento window as a list of DayInfo, for the interest triage dialog. */
export function mieventoDays(): DayInfo[] {
  return DAYS.filter((d) => d.iso >= MIEVENTO_START && d.iso <= MIEVENTO_END);
}

/** Where classmates go to actually buy MiEvento tickets. */
export const MIEVENTO_TICKET_URL = "https://www.mieventos.com/event-multiple-detail/czr-2027";

export const MIEVENTO_TICKET_STATUSES: MieventoTicketStatusValue[] = ["not_registered", "researching", "purchased"];
export const MIEVENTO_TICKET_STATUS_LABEL: Record<MieventoTicketStatusValue, string> = {
  not_registered: "Haven't registered yet",
  researching: "Looking into it",
  purchased: "Purchased my tickets",
};

/**
 * The MiEvento sub-events flagged "tickets coming soon" in the schedule —
 * these are the ones that make up the MiEvento shopping list, since they're
 * the events classmates still need to go register/pay for externally.
 */
export function mieventoShoppingEvents(): ScheduledEvent[] {
  return SCHEDULED_EVENTS.filter((e) => e.blue);
}

/** Tallies each ticket status across everyone, for one MiEvento sub-event id. */
export function mieventoTicketTally(people: Person[], eventId: string): Record<MieventoTicketStatusValue, number> {
  const tally: Record<MieventoTicketStatusValue, number> = { not_registered: 0, researching: 0, purchased: 0 };
  for (const p of people) {
    const entry = p.mievento_ticket_status?.[eventId];
    if (entry?.status) tally[entry.status] += 1;
  }
  return tally;
}

export const MAINTENANCE_PIN = "3817";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const dropdownDateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export interface DateOption {
  value: string;
  label: string;
}

/** Arrive dropdown options: plain dates Jan 9–30, with "or earlier" suffix on the first (boundary) option only. */
export function arriveOptions(): DateOption[] {
  return DAYS.map((d, i) => ({
    value: d.iso,
    label: i === 0 ? `${dropdownDateFmt.format(parseISO(d.iso))} or earlier` : dropdownDateFmt.format(parseISO(d.iso)),
  }));
}

/** Depart dropdown options: plain dates Jan 9–30, with "or later" suffix on the last (boundary) option only. */
export function departOptions(): DateOption[] {
  return DAYS.map((d, i) => ({
    value: d.iso,
    label: i === DAYS.length - 1 ? `${dropdownDateFmt.format(parseISO(d.iso))} or later` : dropdownDateFmt.format(parseISO(d.iso)),
  }));
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const monthDayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Every day in the reunion window, Jan 9–30, 2027. */
export const DAYS: DayInfo[] = (() => {
  const out: DayInfo[] = [];
  let cursor = START_DATE;
  while (cursor <= END_DATE) {
    const d = parseISO(cursor);
    const weekday = weekdayFmt.format(d);
    out.push({
      iso: cursor,
      weekday,
      label: `${weekday}, ${monthDayFmt.format(d)}`,
      short: `${weekday} ${monthDayFmt.format(d)}`,
    });
    cursor = addDays(cursor, 1);
  }
  return out;
})();

export function formatDateRange(startIso: string, endIso: string): string {
  if (startIso === endIso) return monthDayFmt.format(parseISO(startIso));
  const start = DAYS.find((d) => d.iso === startIso);
  const end = DAYS.find((d) => d.iso === endIso);
  if (start && end) {
    const s = monthDayFmt.format(parseISO(start.iso));
    const e = monthDayFmt.format(parseISO(end.iso));
    return start.iso.slice(0, 7) === end.iso.slice(0, 7) ? `${s} – ${e.split(" ")[1]}` : `${s} – ${e}`;
  }
  return `${startIso} – ${endIso}`;
}

// ---------------------------------------------------------------------------
// Schedule / status business logic
// ---------------------------------------------------------------------------

/** True for the pre-/post-MiEvento shoulder days (loosely organized, not the core group window). */
export function isShoulderDay(iso: string): boolean {
  return SHOULDER_START.includes(iso) || SHOULDER_END.includes(iso);
}

/** Whichever of "MiEvento" or "Event/Activity" a busy slot on this date should be labeled. */
export function mieventoOrEventLabel(iso: string): "MiEvento" | "Event/Activity" {
  return iso >= MIEVENTO_START && iso <= MIEVENTO_END ? "MiEvento" : "Event/Activity";
}

/** Whether a scheduled event applies to a given date. */
export function eventAppliesToDate(eventId: string, iso: string): boolean {
  const event = SCHEDULED_EVENTS.find((e) => e.id === eventId);
  return !!event?.days.includes(iso);
}

/**
 * The events selectable as a "busy" reason for a given date (excludes yacht-club; excludes
 * pool-day — that's now its own standalone status, see statusesForSlot()).
 *
 * When `period` is given, also restricts to events that can actually happen in that
 * exact time-of-day slot: an event's `autoSlots` list is its full set of valid periods
 * (e.g. ["m"] for a morning-only tour, ["a"] for an afternoon-only tour, ["m","a"] for one
 * that spans the day, ["e"] for evening-only). A period not in that list is never offered —
 * so a morning-only tour never leaks into the afternoon dropdown and vice versa. Events with
 * no autoSlots restriction (no fixed time) are always offered.
 */
export function eventsForDate(iso: string, period?: Period): ScheduledEvent[] {
  return SCHEDULED_EVENTS.filter((e) => {
    if (e.id === "yacht-club" || e.id === "pool-day") return false;
    if (!eventAppliesToDate(e.id, iso)) return false;
    if (!period || !e.autoSlots) return true;
    return e.autoSlots.includes(period);
  });
}

export function isPoolDayEligible(iso: string): boolean {
  return POOL_DAY_DATES.includes(iso);
}

/** Evening slots on these dates never offer "busy"/MiEvento as a status — those
 * evenings are exclusively Available/Maybe/Private — unless the slot is *already*
 * set to busy (so an existing pick doesn't silently disappear from the list). */
const BUSY_HIDDEN_EVENING_DATES: string[] = ["2027-01-17", "2027-01-18", "2027-01-24"];

/**
 * The selectable statuses for a given day+period slot, in the exact order the
 * live site presents them. "Drinking All Day at the Pool" is a 5th, standalone
 * status (not a "busy" reason) offered only on Morning/Afternoon slots within
 * the pool-day-eligible date range (Jan 13–27) — Evening slots never offer it.
 *
 * `currentStatus` lets an evening slot that's already "busy" keep showing that
 * option even on a BUSY_HIDDEN_EVENING_DATES date, so an existing choice never
 * vanishes out from under the person who made it.
 */
export function statusesForSlot(iso: string, period: Period, currentStatus?: SlotStatus): SlotStatus[] {
  const base: SlotStatus[] = ["ok", "maybe", "busy", "private"];
  const withPool = period !== "e" && isPoolDayEligible(iso) ? [...base, "pool-day" as SlotStatus] : base;
  if (period === "e" && BUSY_HIDDEN_EVENING_DATES.includes(iso) && currentStatus !== "busy") {
    return withPool.filter((s) => s !== "busy");
  }
  return withPool;
}

/** Group-planned sub-event ids are prefixed "czr-" + the base activity id. */
export function isGroupPlannedId(id: string): boolean {
  return id.startsWith("czr-");
}
export function toGroupPlannedId(activityId: string): string {
  return `czr-${activityId}`;
}
export function fromGroupPlannedId(id: string): string {
  return id.slice(4);
}

/** Human label for any busy-slot tag id, prefixing "(BHS87 event)" for czr- ids. */
export function labelForTag(tag: string, activities: Activity[]): string {
  if (isGroupPlannedId(tag)) {
    const activityId = fromGroupPlannedId(tag);
    const base = activities.find((a) => a.id === activityId)?.label ?? BASE_ACTIVITIES.find((a) => a.id === activityId)?.label ?? activityId;
    return `${base} (BHS87 event)`;
  }
  return EVENT_LABEL_BY_ID[tag] ?? tag;
}

const SCHEDULED_EVENT_BY_ID: Record<string, ScheduledEvent> = Object.fromEntries(
  SCHEDULED_EVENTS.map((e) => [e.id, e]),
);

/** Label including the parenthetical timing/ticket note, e.g. "Railway (Fri 22 morning &
 * afternoon \u2014 tickets coming soon)" \u2014 used only for the live Jan 17\u201324 sub-event picker,
 * where retaining that context (timeframe / ticket status) matters. Other surfaces (roster,
 * heatmap tooltips) keep using the plain `labelForTag` label. */
export function labelWithNoteForTag(tag: string, activities: Activity[]): string {
  if (isGroupPlannedId(tag)) return labelForTag(tag, activities);
  const event = SCHEDULED_EVENT_BY_ID[tag];
  if (!event) return labelForTag(tag, activities);
  return event.note ? `${event.label} (${event.note})` : event.label;
}

/** Color/weight category for a resolved MiEvento sub-event tag, matched to the live reference
 * site: "blue" for headline picks, "soon" for tickets-pending, "soft" for optional add-ons,
 * else muted. Group-planned (czr-) tags are handled by their own cluster styling and return
 * undefined here so callers leave that path untouched. */
export function eventCategoryClass(tag: string | undefined): string | undefined {
  if (!tag || isGroupPlannedId(tag)) return undefined;
  const event = SCHEDULED_EVENT_BY_ID[tag];
  if (!event) return undefined;
  if (event.blue) return "text-blue-event";
  if (event.soon) return "text-soon-event";
  if (event.soft) return "text-soft-event";
  return "text-muted-foreground";
}

/** Synthetic selectable sub-events generated from open event plans landing on this date.
 * When `period` is given, applies the same evening-only/day-only restriction as
 * `eventsForDate()` so a group-planned evening activity doesn't leak into Morning/Afternoon
 * (and vice versa). */
export function groupPlannedEventsForDate(iso: string, eventPlans: EventPlan[], activities: Activity[], period?: Period): { id: string; label: string; note?: string; autoSlots: Period[] }[] {
  return eventPlans
    .filter((p) => p.status === "open" && p.event_date === iso)
    .map((p) => {
      const base = activities.find((a) => a.id === p.activity_id) ?? BASE_ACTIVITIES.find((a) => a.id === p.activity_id);
      return {
        id: toGroupPlannedId(p.activity_id),
        label: `${base?.label ?? p.activity_id} (BHS87 event)`,
        autoSlots: autoSlotsForTimeOfDay(activityTimeOfDay(p.activity_id)),
      };
    })
    .filter((e) => (period ? e.autoSlots.includes(period) : true));
}

/**
 * Default per-date overrides applied to every fresh entry — the known-event
 * defaults the live site pre-fills so a new respondent sees a realistic
 * starting schedule instead of a blank green grid. Days/periods not listed
 * here default to "ok" (Available). Un-tagged "busy" entries render as an
 * unresolved "Which event?" prompt until the person picks one.
 */
const DEFAULT_SLOT_OVERRIDES: Partial<Record<string, { period: Period; status: SlotStatus; tag?: string }[]>> = {
  "2027-01-13": [{ period: "e", status: "busy", tag: "czr-napoli" }],
  "2027-01-17": [
    { period: "m", status: "busy" },
    { period: "a", status: "busy" },
  ],
  "2027-01-19": [{ period: "e", status: "busy", tag: "coffee-house-19" }],
  "2027-01-21": [{ period: "e", status: "busy", tag: "chicken-21" }],
  "2027-01-22": [
    { period: "m", status: "busy", tag: "railway-22" },
    { period: "a", status: "busy", tag: "railway-22" },
    { period: "e", status: "busy", tag: "pin-ding-22" },
  ],
  "2027-01-23": [{ period: "e", status: "busy", tag: "mega-cruise-23" }],
  "2027-01-24": [
    { period: "m", status: "busy" },
    { period: "a", status: "busy" },
  ],
};

/** Initializes a fresh person's slots as Available across the whole trip, with the known-event defaults and the Yacht Club lock applied. */
export function initSlots(arrival: string, departure: string): PersonSlots {
  const slots: PersonSlots = {};
  let cursor = arrival;
  while (cursor <= departure) {
    slots[cursor] = { m: { s: "ok" }, a: { s: "ok" }, e: { s: "ok" } };
    const overrides = DEFAULT_SLOT_OVERRIDES[cursor];
    if (overrides) {
      for (const o of overrides) {
        slots[cursor][o.period] = o.tag ? { s: o.status, t: o.tag } : { s: o.status };
      }
    }
    cursor = addDays(cursor, 1);
  }
  if (slots[YACHT_LOCK.iso]) {
    slots[YACHT_LOCK.iso][YACHT_LOCK.slot] = { s: "busy", t: YACHT_LOCK.tag };
  }
  return slots;
}

export function isYachtLockSlot(iso: string, period: Period): boolean {
  return iso === YACHT_LOCK.iso && period === YACHT_LOCK.slot;
}

/** In-town check for a specific day/period, or "out" if outside the person's arrival/departure window. */
export function statusFor(person: Person, iso: string, period: Period): SlotStatus | "out" {
  if (isYachtLockSlot(iso, period) && iso >= person.arrival && iso <= person.departure) return "busy";
  if (iso < person.arrival || iso > person.departure) return "out";
  return person.slots?.[iso]?.[period]?.s ?? "ok";
}

export interface WindowTally {
  ok: string[];
  maybe: string[];
  busy: string[];
  private: string[];
  "pool-day": string[];
  out: string[];
}

/** Tallies who's ok/maybe/busy/private/pool-day/out for a specific day+period, optionally filtered to people interested in `activityId`. */
export function tallyWindow(people: Person[], iso: string, period: Period, activityId?: string): WindowTally {
  const tally: WindowTally = { ok: [], maybe: [], busy: [], private: [], "pool-day": [], out: [] };
  for (const person of people) {
    if (activityId && !person.interests?.includes(activityId)) continue;
    const status = statusFor(person, iso, period);
    tally[status].push(person.name);
  }
  return tally;
}

export interface DetailedWindowTally {
  ok: string[];
  maybe: string[];
  busy: { name: string; label: string }[];
  private: string[];
  out: string[];
}

/** Like tallyWindow, but busy entries carry the event label (for the heatmap's per-cell breakdown popover). */
export function tallyWindowDetailed(people: Person[], iso: string, period: Period, activities: Activity[]): DetailedWindowTally {
  const out: DetailedWindowTally = { ok: [], maybe: [], busy: [], private: [], out: [] };
  for (const person of people) {
    const status = statusFor(person, iso, period);
    if (status === "ok" || status === "pool-day") out.ok.push(person.name);
    else if (status === "maybe") out.maybe.push(person.name);
    else if (status === "private") out.private.push(person.name);
    else if (status === "out") out.out.push(person.name);
    else if (status === "busy") {
      if (isYachtLockSlot(iso, period)) {
        out.busy.push({ name: person.name, label: "Yacht Club 87 Dinner/Dance" });
      } else {
        const tag = person.slots?.[iso]?.[period]?.t;
        out.busy.push({ name: person.name, label: tag ? labelForTag(tag, activities) : "Existing event" });
      }
    }
  }
  return out;
}

/**
 * Merges the built-in seed activities with any classmate-suggested rows from the
 * `activities` table, keeping exactly one entry per id — BASE_ACTIVITIES wins ties.
 *
 * A classmate suggesting a "new" activity that slugifies to an id already in
 * BASE_ACTIVITIES (e.g. typing "Golf" → id "golf", which already exists) inserts a
 * second `activities` row with the same id. Every function that renders or counts
 * activities MUST merge through this helper instead of concatenating the raw arrays
 * — otherwise that same activity renders twice (this caused the Interest Clusters
 * duplicate-pill bug in Maintenance mode, since `clusterSummaries` mapped the raw,
 * un-deduped list while `interestPillCounts` already deduped).
 */
export function mergeActivities(activities: Activity[]): Activity[] {
  return [...BASE_ACTIVITIES, ...activities.filter((a) => !BASE_ACTIVITIES.some((b) => b.id === a.id))];
}

/** Interest pills in the same left-to-right/top-to-bottom order shown on the entry form, each with how many respondents picked it — for the dashboard's left-edge curtain filter. */
export function interestPillCounts(people: Person[], activities: Activity[]): { id: string; label: string; count: number }[] {
  const all = mergeActivities(activities);
  return all.map((activity) => ({
    id: activity.id,
    label: activity.label,
    count: people.filter((p) => p.interests?.includes(activity.id)).length,
  }));
}

/** Scopes a people list to those interested in `activityId`; passing null/undefined returns everyone. */
export function scopeByInterest(people: Person[], activityId: string | null | undefined): Person[] {
  if (!activityId) return people;
  return people.filter((p) => p.interests?.includes(activityId));
}

/** Best windows for the whole group: every day+period ranked by number available ("ok"), highest first. */
export function bestWindows(people: Person[], limit = 5): { iso: string; period: Period; day: DayInfo; available: number; total: number }[] {
  const rows: { iso: string; period: Period; day: DayInfo; available: number; total: number }[] = [];
  for (const day of DAYS) {
    for (const period of PERIODS) {
      const tally = tallyWindow(people, day.iso, period);
      const total = people.length;
      if (total === 0) continue;
      rows.push({ iso: day.iso, period, day, available: tally.ok.length, total });
    }
  }
  return rows.sort((a, b) => b.available - a.available).slice(0, limit);
}

/** Ranked "best windows for the group" row: percentage available per period, per day. Yacht-locked evening (Wed 20) is excluded (null) since it's mandatory for everyone. */
export interface RankedWindowRow {
  day: DayInfo;
  periods: Partial<Record<Period, { available: number; total: number; pct: number } | null>>;
}

/** Group-wide best windows, ranked by average availability across periods, in a 2-column/N-row shape for the dashboard's percentage-badge layout. */
export function bestWindowsRanked(people: Person[], limit = 6): RankedWindowRow[] {
  const scored: (RankedWindowRow & { avg: number })[] = [];
  for (const day of DAYS) {
    const periods: RankedWindowRow["periods"] = {};
    let sum = 0;
    let count = 0;
    for (const period of PERIODS) {
      if (isYachtLockSlot(day.iso, period)) {
        periods[period] = null;
        continue;
      }
      const tally = tallyWindow(people, day.iso, period);
      const inTown = people.length - tally.out.length;
      if (inTown === 0) {
        periods[period] = null;
        continue;
      }
      const pct = Math.round((tally.ok.length / inTown) * 100);
      periods[period] = { available: tally.ok.length, total: inTown, pct };
      sum += pct;
      count++;
    }
    if (count === 0) continue;
    scored.push({ day, periods, avg: sum / count });
  }
  return scored.sort((a, b) => b.avg - a.avg).slice(0, limit).map(({ avg, ...row }) => row);
}

/** Green (high) → olive (low) text/badge color for a 0–100 availability percentage. */
export function pctScaleColor(pct: number): string {
  const hue = 45 + ((152 - 45) * Math.min(Math.max(pct, 0), 100)) / 100;
  return `hsl(${hue.toFixed(0)} 48% 30%)`;
}
export function pctScaleBg(pct: number): string {
  const hue = 45 + ((152 - 45) * Math.min(Math.max(pct, 0), 100)) / 100;
  return `hsl(${hue.toFixed(0)} 48% 92%)`;
}

/** Who most recently saved/updated their entry — for the maintenance-only "last edited by" indicator. */
export function mostRecentEditor(people: Person[]): { name: string; updated_at: string } | null {
  const withTimestamps = people.filter((p) => p.updated_at);
  if (withTimestamps.length === 0) return null;
  const latest = withTimestamps.reduce((a, b) => ((a.updated_at! > b.updated_at!) ? a : b));
  return { name: latest.name, updated_at: latest.updated_at! };
}

/** The most recent `limit` people to have saved/edited their availability, newest first.
 * Uses the existing `people.updated_at` save timestamp — not a separate page-visit log. */
export function recentEditors(people: Person[], limit = 5): { name: string; updated_at: string }[] {
  return people
    .filter((p) => p.updated_at)
    .slice()
    .sort((a, b) => (b.updated_at! > a.updated_at! ? 1 : b.updated_at! < a.updated_at! ? -1 : 0))
    .slice(0, limit)
    .map((p) => ({ name: p.name, updated_at: p.updated_at! }));
}

export interface ClusterSummary {
  activity: Activity;
  interestedCount: number;
  interestedNames: string[];
  tier: "none" | "public" | "candidate" | "spinoff";
}

/** Interest-cluster stage label shown on each cluster card, per the group's published legend. */
export function clusterStage(count: number, thresholds: ClusterThresholds = CLUSTER_THRESHOLDS): "Gathering" | "Sub-event candidate" | "Spin-off" {
  if (count >= thresholds.spinoffAt) return "Spin-off";
  if (count >= thresholds.candidateAt) return "Sub-event candidate";
  return "Gathering";
}

/** Best windows scoped to the people interested in one activity — "Day, Period — X of Y free" lines for a cluster card. */
export function bestWindowsForActivity(people: Person[], activityId: string, limit = 3): { iso: string; period: Period; day: DayInfo; available: number; total: number }[] {
  const interested = people.filter((p) => p.interests?.includes(activityId));
  const total = interested.length;
  if (total === 0) return [];
  const rows: { iso: string; period: Period; day: DayInfo; available: number; total: number }[] = [];
  for (const day of DAYS) {
    for (const period of PERIODS) {
      const tally = tallyWindow(interested, day.iso, period);
      rows.push({ iso: day.iso, period, day, available: tally.ok.length, total });
    }
  }
  return rows.sort((a, b) => b.available - a.available).slice(0, limit);
}

/** Buckets each activity's interest level against CLUSTER_THRESHOLDS. */
export function clusterSummaries(people: Person[], activities: Activity[]): ClusterSummary[] {
  return mergeActivities(activities).map((activity) => {
    const interestedNames = people.filter((p) => p.interests?.includes(activity.id)).map((p) => p.name);
    const count = interestedNames.length;
    let tier: ClusterSummary["tier"] = "none";
    if (count >= CLUSTER_THRESHOLDS.spinoffAt) tier = "spinoff";
    else if (count >= CLUSTER_THRESHOLDS.candidateAt) tier = "candidate";
    else if (count >= CLUSTER_THRESHOLDS.publicMinInterest) tier = "public";
    return { activity, interestedCount: count, interestedNames, tier };
  }).sort((a, b) => b.interestedCount - a.interestedCount);
}

export interface SharedCommitment {
  event: ScheduledEvent;
  count: number;
  /** Distinct dates (short label, e.g. "Tue Jan 12") this event is marked on someone's schedule. */
  dates: string[];
}

/** Tallies how many respondents currently have each known scheduled event (Yacht Club, MiEvento week bookings, tours, pool day, ...) marked on their schedule — "times blocked by existing events the group already knows about." */
export function sharedCommitments(people: Person[]): SharedCommitment[] {
  const counts: Record<string, number> = {};
  const dateSets: Record<string, Set<string>> = {};
  function markDate(eventId: string, iso: string) {
    if (!dateSets[eventId]) dateSets[eventId] = new Set();
    dateSets[eventId].add(iso);
  }
  for (const person of people) {
    const seen = new Set<string>();
    for (const [iso, day] of Object.entries(person.slots ?? {})) {
      for (const slot of Object.values(day ?? {})) {
        if ((slot?.s === "busy" || slot?.s === "pool-day") && slot.t && !isGroupPlannedId(slot.t)) {
          seen.add(slot.t);
          markDate(slot.t, iso);
        }
      }
    }
    if (person.arrival <= YACHT_LOCK.iso && person.departure >= YACHT_LOCK.iso) {
      seen.add(YACHT_LOCK.tag);
      markDate(YACHT_LOCK.tag, YACHT_LOCK.iso);
    }
    for (const id of Array.from(seen)) counts[id] = (counts[id] ?? 0) + 1;
  }
  return SCHEDULED_EVENTS.filter((e) => e.id !== "other" && counts[e.id])
    .map((event) => ({
      event,
      count: counts[event.id],
      dates: Array.from(dateSets[event.id] ?? [])
        .sort()
        .map((iso) => DAYS.find((d) => d.iso === iso)?.short ?? iso),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Distinct labels of any auto-slot conflicts (scheduled group events) a person's slots reference. */
export function autoSlotConflicts(person: Person): string[] {
  const labels: string[] = [];
  for (const day of Object.values(person.slots ?? {})) {
    for (const slot of Object.values(day ?? {})) {
      if (slot?.s === "busy" && slot.t) {
        const event = SCHEDULED_EVENTS.find((e) => e.id === slot.t);
        if (event?.autoSlots && !labels.includes(event.label)) labels.push(event.label);
      }
    }
  }
  return labels;
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export function exportAvailabilityCsv(people: Person[], activities: Activity[]): void {
  const header = [
    "Name", "Email", "In town from", "In town to", "Interests",
    ...DAYS.flatMap((day) => PERIODS.map((p) => `${day.short} ${PERIOD_SHORT[p]}`)),
  ];
  const rows = people.map((person) => [
    person.name,
    person.email ?? "",
    person.arrival,
    person.departure,
    person.interests.join("; "),
    ...DAYS.flatMap((day) =>
      PERIODS.map((p) => {
        const status = statusFor(person, day.iso, p);
        if (status === "out") return "Out of town";
        const slot = person.slots?.[day.iso]?.[p];
        return status === "busy" && slot?.t ? `${STATUS_LABEL[status]} (${labelForTag(slot.t, activities)})` : STATUS_LABEL[status];
      }),
    ),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "czr-bhs87-reunion-availability.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Storage — window.name-backed key/value store
// ---------------------------------------------------------------------------
//
// Matches the live site's own approach: `window.name` survives navigation within
// a tab and, unlike localStorage/sessionStorage/cookies, is not blocked in
// sandboxed cross-origin iframes (this platform's preview) or third-party
// storage-partitioned contexts. Falls back to an in-memory object if `window`
// is unavailable (SSR-safe no-op).

const STORE_PREFIX = "hr-store:";

function readStore(): Record<string, unknown> {
  try {
    const raw = window.name;
    if (!raw || !raw.startsWith(STORE_PREFIX)) return {};
    return JSON.parse(raw.slice(STORE_PREFIX.length));
  } catch {
    return {};
  }
}

export const storage = {
  get<T = unknown>(key: string): T | null {
    try {
      const store = readStore();
      return (key in store ? (store[key] as T) : null);
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): void {
    try {
      const store = readStore();
      store[key] = value;
      window.name = STORE_PREFIX + JSON.stringify(store);
    } catch {
      /* ignore */
    }
  },
  del(key: string): void {
    try {
      const store = readStore();
      delete store[key];
      window.name = STORE_PREFIX + JSON.stringify(store);
    } catch {
      /* ignore */
    }
  },
};

const STORAGE_KEYS = {
  leadInvite: "hr-lead-invite",
  email: "hr-email",
  accessToken: "hr-access-token",
  refreshToken: "hr-refresh-token",
  clusterThresholds: "cluster-thresholds",
  /** Name + email captured on the My Availability tab — used to identify "me" for
   * volunteer sign-up, independent of the Roll Call magic-link auth session. */
  myIdentity: "hr-my-identity",
} as const;

export interface MyIdentity {
  name: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Supabase REST client (hand-rolled fetch, matching the live site — no supabase-js)
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function requireEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY environment variables.");
  }
  return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
}

export function parseAuthHashFragment(hash: string): { accessToken?: string; refreshToken?: string; email?: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const accessToken = params.get("access_token") ?? undefined;
  const refreshToken = params.get("refresh_token") ?? undefined;
  let email: string | undefined;
  if (accessToken) {
    try {
      const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      email = payload.email;
    } catch {
      /* ignore malformed token */
    }
  }
  return { accessToken, refreshToken, email };
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const supabaseAuth = {
  /** Sends a magic-link sign-in email (creates the auth user on first use). */
  async sendMagicLink(email: string): Promise<void> {
    const { url, key } = requireEnv();
    const res = await fetch(`${url}/auth/v1/otp`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, create_user: true }),
    });
    if (!res.ok) throw new Error(`Could not send sign-in email (${res.status})`);
  },

  /** Verifies the token_hash from a magic-link redirect, trying magiclink then signup. */
  async verifyMagicLink(tokenHash: string): Promise<{ access_token: string; refresh_token: string }> {
    const { url, key } = requireEnv();
    for (const type of ["magiclink", "signup"] as const) {
      const res = await fetch(`${url}/auth/v1/verify`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type, token_hash: tokenHash }),
      });
      if (res.ok) return res.json();
    }
    throw new Error("This sign-in link is invalid or has expired.");
  },

  async refreshSession(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const { url, key } = requireEnv();
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error("Session refresh failed");
    return res.json();
  },

  async getUser(accessToken: string): Promise<{ email?: string }> {
    const { url, key } = requireEnv();
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("Could not load session user");
    return res.json();
  },
};

/** Generic PostgREST fetch wrapper. Uses the signed-in session token when present, else the anon key only. */
export async function supabaseRest<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string | null; prefer?: string } = {},
): Promise<T> {
  const { url, key } = requireEnv();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${options.accessToken || key}`,
    "Content-Type": "application/json",
  };
  if (options.prefer) headers["Prefer"] = options.prefer;
  const res = await fetch(`${url}/rest/v1${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export { STORAGE_KEYS };

/** Reads the name+email captured on the My Availability tab, if any. */
export function readMyIdentity(): MyIdentity | null {
  return storage.get<MyIdentity>(STORAGE_KEYS.myIdentity);
}

/** Persists the name+email captured on the My Availability tab so volunteer
 * sign-up can identify "me" without requiring the Roll Call magic-link sign-in. */
export function writeMyIdentity(identity: MyIdentity): void {
  storage.set(STORAGE_KEYS.myIdentity, identity);
}

// ---------------------------------------------------------------------------
// Demo/seed data — used only for local QA against stubbed routes, never
// written to the live project. Names here are fictional and are NOT the
// classmates who have actually responded on the live site.
// ---------------------------------------------------------------------------

type SlotEdit = [dayOffset: number, period: Period, status: SlotStatus, tag?: string];

export function buildDemoPerson(
  name: string,
  arrivalOffset: number,
  departureOffset: number,
  edits: SlotEdit[],
  interests: string[],
  extra: Partial<Person> = {},
): Person {
  const arrival = addDays(START_DATE, arrivalOffset);
  const departure = addDays(START_DATE, departureOffset);
  const slots = initSlots(arrival, departure);
  for (const [dayOffset, period, status, tag] of edits) {
    const iso = addDays(START_DATE, dayOffset);
    if (slots[iso]) slots[iso][period] = tag ? { s: status, t: tag } : { s: status };
  }
  return { name, arrival, departure, slots, interests, updated_at: new Date().toISOString(), ...extra };
}

export const DEMO_PEOPLE: Person[] = [
  buildDemoPerson("Marcus Bell", 4, 21, [
    [12, "m", "busy", "golf-21"],
    [12, "a", "busy", "golf-21"],
    [13, "m", "busy", "railway-22"],
  ], ["railway-87", "deep-sea-fishing", "cruise-87"], {
    email: "marcus.demo@example.com",
    yacht_paid: true,
    mievento_ticket_status: { "railway-22": { status: "purchased" }, "mega-cruise-23": { status: "researching" } },
  }),
  buildDemoPerson("Danny Whitfield", 4, 10, [
    [8, "m", "busy", "transit-17"],
    [8, "a", "busy", "transit-17"],
  ], ["napoli", "coronado", "casino"], {
    email: "danny.demo@example.com",
    mievento_intents: { "2027-01-17": "very", "2027-01-18": "somewhat" },
    mievento_ticket_status: { "coffee-house-19": { status: "not_registered", note: "Waiting to see who else is going first." } },
  }),
  buildDemoPerson("Jerry Pankow", 0, 21, [], ["napoli", "hiking", "escape-room"]),
];
