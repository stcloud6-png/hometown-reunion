/**
 * Reunion weather estimates (info only).
 *
 * The site only starts collecting daily readings on 2026-11-19, so a straight-line
 * trend would run off the chart within weeks. Instead each estimate is:
 *
 *   long-term normal for that calendar day  +  how far the site's own readings
 *   have recently run above/below normal (shrunk toward 0 while there are few days)
 *
 * The more days the site has collected, the more the estimate leans on them.
 */

export type City = "Orlando, FL" | "Panama City";
export const CITIES: City[] = ["Orlando, FL", "Panama City"];

export interface DailyReading {
  city: string;
  observed_on: string; // YYYY-MM-DD
  high_f: number | string | null;
  low_f: number | string | null;
}

/**
 * Monthly normal [high, low] °F, Jan..Dec.
 * Orlando: NWS Melbourne, Orlando Intl 1991–2020 normals (rounded).
 * Panama City: WeatherSpark long-term averages for Panamá (1980–2016).
 */
export const MONTHLY_NORMALS: Record<City, [number, number][]> = {
  "Orlando, FL": [
    [72, 50], [75, 53], [79, 56], [84, 61], [88, 66], [91, 72],
    [92, 74], [92, 74], [90, 72], [85, 66], [78, 58], [74, 53],
  ],
  "Panama City": [
    [88, 76], [89, 76], [90, 76], [89, 77], [87, 77], [86, 77],
    [87, 77], [86, 76], [86, 76], [85, 76], [85, 76], [87, 76],
  ],
};

/** Readings from the last LOOKBACK_DAYS (before the latest one) set the offset. */
export const LOOKBACK_DAYS = 30;
/** Shrinkage: weight = n / (n + PRIOR_DAYS). 3 days ≈ 18%, 30 days ≈ 68%. */
export const PRIOR_DAYS = 14;
/** Never move the estimate more than this far from normal. */
export const MAX_OFFSET_F = 6;

/** The chart runs through December 2027 so all-year locations fit (owner, 2026-11-21). */
export const CHART_END = "2027-12-31";

export const MILESTONES = [
  { date: "2027-01-15", label: "15 Jan 2027" },
  { date: "2027-07-04", label: "4 Jul 2027" },
] as const;

const DAY_MS = 86_400_000;
export const toDay = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const dayIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const num = (v: number | string | null) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * Value for a calendar day from a 12-month [high, low] table: each month sits on
 * the 15th, linear in between (wraps the year).
 */
export function interpolateMonthly(table: [number, number][], iso: string): { high: number; low: number } {
  const t = toDay(iso);
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1;
  const mid = (yy: number, mm: number) => Date.UTC(yy, mm, 15);
  let aY = y, aM = m;
  if (t < mid(y, m)) { aM = m - 1; if (aM < 0) { aM = 11; aY = y - 1; } }
  let bY = aY, bM = aM + 1;
  if (bM > 11) { bM = 0; bY = aY + 1; }
  const a = mid(aY, aM), b = mid(bY, bM);
  const f = (t - a) / (b - a);
  const [ah, al] = table[aM];
  const [bh, bl] = table[bM];
  return { high: ah + (bh - ah) * f, low: al + (bl - al) * f };
}

/** Normal [high, low] for a calendar day in one of the two reunion cities. */
export function normalFor(city: City, iso: string): { high: number; low: number } {
  return interpolateMonthly(MONTHLY_NORMALS[city], iso);
}

export interface CityOffset { high: number; low: number; days: number; weight: number }

/** How far recent site readings run from normal, shrunk by how few days there are. */
export function offsetFor(city: City, rows: DailyReading[]): CityOffset {
  const mine = rows.filter((r) => r.city === city).sort((a, b) => a.observed_on.localeCompare(b.observed_on));
  if (!mine.length) return { high: 0, low: 0, days: 0, weight: 0 };
  const latest = toDay(mine[mine.length - 1].observed_on);
  const recent = mine.filter((r) => latest - toDay(r.observed_on) < LOOKBACK_DAYS * DAY_MS);
  const dh: number[] = [], dl: number[] = [];
  for (const r of recent) {
    const n = normalFor(city, r.observed_on);
    const h = num(r.high_f), l = num(r.low_f);
    if (h != null) dh.push(h - n.high);
    if (l != null) dl.push(l - n.low);
  }
  const days = Math.max(dh.length, dl.length);
  const weight = days / (days + PRIOR_DAYS);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const clamp = (x: number) => Math.max(-MAX_OFFSET_F, Math.min(MAX_OFFSET_F, x));
  return { high: clamp(mean(dh) * weight), low: clamp(mean(dl) * weight), days, weight };
}

export function estimateFor(city: City, iso: string, offset: CityOffset): { high: number; low: number } {
  const n = normalFor(city, iso);
  return { high: n.high + offset.high, low: n.low + offset.low };
}

/** One row per day on the chart. o* = Orlando, p* = Panama; *Est = estimate. */
export interface ChartPoint {
  t: number;
  oHigh?: number; oLow?: number; pHigh?: number; pLow?: number;
  oHighEst?: number; oLowEst?: number; pHighEst?: number; pLowEst?: number;
}

type SeriesKey = Exclude<keyof ChartPoint, "t">;
const KEY: Record<City, "o" | "p"> = { "Orlando, FL": "o", "Panama City": "p" };

/**
 * Collected highs/lows plus estimate curves from the day after the latest reading
 * through `endIso` (weekly, plus each milestone day so the markers sit on the line).
 */
export function buildChart(rows: DailyReading[], endIso = CHART_END) {
  const byT = new Map<number, ChartPoint>();
  const at = (t: number) => byT.get(t) ?? (byT.set(t, { t }), byT.get(t)!);
  let latest = 0;
  for (const r of rows) {
    if (!(CITIES as string[]).includes(r.city)) continue;
    const k = KEY[r.city as City];
    const p = at(toDay(r.observed_on));
    const h = num(r.high_f), l = num(r.low_f);
    if (h != null) p[`${k}High` as SeriesKey] = h;
    if (l != null) p[`${k}Low` as SeriesKey] = l;
    latest = Math.max(latest, p.t);
  }
  const offsets = Object.fromEntries(CITIES.map((c) => [c, offsetFor(c, rows)])) as Record<City, CityOffset>;
  const start = (latest || Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) + DAY_MS;
  const end = toDay(endIso);
  const estDays = new Set<number>();
  for (let t = start; t <= end; t += 7 * DAY_MS) estDays.add(t);
  estDays.add(end);
  for (const m of MILESTONES) if (toDay(m.date) >= start) estDays.add(toDay(m.date));
  for (const t of Array.from(estDays)) {
    const p = at(t);
    for (const c of CITIES) {
      const e = estimateFor(c, dayIso(t), offsets[c]);
      p[`${KEY[c]}HighEst` as SeriesKey] = round1(e.high);
      p[`${KEY[c]}LowEst` as SeriesKey] = round1(e.low);
    }
  }
  const points = Array.from(byT.values()).sort((a, b) => a.t - b.t);
  const milestones = MILESTONES.map((m) => ({
    ...m,
    t: toDay(m.date),
    cities: CITIES.map((c) => {
      const e = estimateFor(c, m.date, offsets[c]);
      const n = normalFor(c, m.date);
      return { city: c, high: Math.round(e.high), low: Math.round(e.low), normalHigh: Math.round(n.high), normalLow: Math.round(n.low) };
    }),
  }));
  return { points, offsets, milestones, latest: latest || null };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
