/**
 * Extra "planning" locations on the Weather chart (owner, 2026-11-21).
 *
 * The locations themselves live only in the database (private.weather_places).
 * The public function weather_places_public() returns codes, button group,
 * periods and monthly normals, never names. Short names come back only from
 * weather_place_names(pin) after the database checks the Maintenance PIN.
 * Nothing in this file (or anywhere in this public repo) names a location.
 */
import { dayIso, interpolateMonthly, toDay, type ChartPoint } from "@/lib/weather-estimate";

export type Season = "spring" | "summer" | "fall";

export interface WeatherPlace {
  code: string;
  geo_group: number; // 1..4
  seasons: Season[];
  normals: [number, number][]; // 12 x [high °F, low °F], Jan..Dec
  sort_order: number;
}

export const SEASONS: { id: Season; label: string; months: string; start: string; end: string }[] = [
  { id: "spring", label: "Spring", months: "Feb–Apr", start: "2027-02-01", end: "2027-04-30" },
  { id: "summer", label: "Summer", months: "May–Sep", start: "2027-05-01", end: "2027-09-30" },
  { id: "fall", label: "Fall", months: "Sep–Nov", start: "2027-09-01", end: "2027-11-30" },
];

export const GEO_GROUPS = [1, 2, 3, 4] as const;

export type HiLo = "both" | "high" | "low";

const DAY_MS = 86_400_000;
export const placeKey = (code: string, which: "hi" | "lo") => `x_${code}_${which}`;

/**
 * Owner-set months for some codes (2026-11-21 and 2026-11-22), as 2027 "MM-DD" ranges.
 * Codes not listed here use the months of their periods (spring/summer/fall).
 */
export const MONTH_WINDOWS: Record<string, [string, string][]> = {
  I: [["06-01", "09-30"]],
  Se: [["01-01", "05-14"], ["10-02", "12-31"]], // none 15 May – 1 Oct (22:36 ET)
  Po1: [["01-01", "12-31"]],
  Bu: [["03-15", "06-19"], ["08-25", "11-07"]], // 15 Mar – 7 Nov, none 20 Jun – 24 Aug (11-22)
  Qu: [["01-01", "12-31"]],
  Pu: [["03-15", "05-20"], ["10-01", "11-07"]], // 15 Mar – 7 Nov, none 21 May – 30 Sep (11-22)
  Sa: [["03-15", "06-01"], ["09-01", "11-07"]], // 15 Mar – 7 Nov, none 2 Jun – 31 Aug (11-22)
  Al: [["02-01", "05-14"], ["09-02", "11-30"]], // none 15 May – 1 Sep (22:36 ET)
  O: [["02-01", "07-01"], ["09-01", "10-27"]], // to 1 Jul; fall ends 27 Oct (11-22)
  N1: [["05-21", "09-30"]], // starts 21 May (22:36 ET)
};

const mergeWindows = (raw: [number, number][]) => {
  const sorted = [...raw].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1] + DAY_MS) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w] as [number, number]);
  }
  return merged;
};

/** All the [start, end] days a place is drawn over, whatever periods are selected. */
export function placeWindows(place: WeatherPlace): [number, number][] {
  const custom = MONTH_WINDOWS[place.code];
  if (custom) return mergeWindows(custom.map(([a, b]) => [toDay(`2027-${a}`), toDay(`2027-${b}`)]));
  return mergeWindows(SEASONS.filter((s) => place.seasons.includes(s.id)).map((s) => [toDay(s.start), toDay(s.end)]));
}

/**
 * A place shows (over all of its months) when any of its months fall in a
 * selected period; otherwise it's hidden.
 */
export function windowsFor(place: WeatherPlace, activeSeasons: Set<Season>): [number, number][] {
  const own = placeWindows(place);
  const selected = SEASONS.filter((s) => activeSeasons.has(s.id)).map((s) => [toDay(s.start), toDay(s.end)]);
  const overlaps = own.some(([a, b]) => selected.some(([c, d]) => a <= d && c <= b));
  return overlaps ? own : [];
}

/** Places switched on individually (checkboxes under buttons #1–#4). */
export function visiblePlaces(places: WeatherPlace[], activeCodes: Set<string>, activeSeasons: Set<Season>) {
  return places
    .filter((p) => activeCodes.has(p.code))
    .map((p) => ({ place: p, windows: windowsFor(p, activeSeasons) }))
    .filter((v) => v.windows.length > 0);
}

/**
 * Adds each visible place's estimated high/low onto the chart rows, only inside
 * its windows. Every place gets a value on every row inside its window (window
 * edges and a weekly grid), so its line never breaks mid-window and does break
 * between two separate windows.
 */
export function addPlacesToChart(points: ChartPoint[], visible: ReturnType<typeof visiblePlaces>): ChartPoint[] {
  if (!visible.length) return points;
  const rows = new Map<number, Record<string, number>>();
  for (const p of points) rows.set(p.t, { ...(p as unknown as Record<string, number>) });
  const ensure = (t: number) => rows.get(t) ?? (rows.set(t, { t }), rows.get(t)!);
  // Grid: every window edge, plus weekly steps inside each window.
  for (const { windows } of visible) {
    for (const [a, b] of windows) {
      for (let t = a; t < b; t += 7 * DAY_MS) ensure(t);
      ensure(b);
    }
  }
  const all = Array.from(rows.values());
  for (const { place, windows } of visible) {
    for (const row of all) {
      if (!windows.some(([a, b]) => row.t >= a && row.t <= b)) continue;
      const v = interpolateMonthly(place.normals, dayIso(row.t));
      row[placeKey(place.code, "hi")] = Math.round(v.high * 10) / 10;
      row[placeKey(place.code, "lo")] = Math.round(v.low * 10) / 10;
    }
  }
  return all.sort((a, b) => a.t - b.t) as unknown as ChartPoint[];
}

/** Monthly figures shown in the table under the chart: the months of each selected period. */
export function monthlyRows(visible: ReturnType<typeof visiblePlaces>) {
  return visible.map(({ place, windows }) => {
    const months: { label: string; high: number; low: number }[] = [];
    const seen = new Set<number>();
    for (const [a, b] of windows) {
      const lastM = new Date(b).getUTCDate() === 1 ? new Date(b).getUTCMonth() - 1 : new Date(b).getUTCMonth();
      for (let m = new Date(a).getUTCMonth(); m <= lastM; m++) {
        if (seen.has(m)) continue;
        seen.add(m);
        months.push({
          label: new Date(Date.UTC(2027, m, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
          high: place.normals[m][0],
          low: place.normals[m][1],
        });
      }
    }
    return { code: place.code, group: place.geo_group, months };
  });
}

/** Stub-mode stand-ins (made-up numbers, codes only) so the page works offline. */
export const DEMO_PLACES: WeatherPlace[] = [
  ["B", 1, ["spring"]], ["E", 1, ["spring"]],
  ["I", 2, ["summer"]], ["Al", 2, ["fall"]], ["Se", 2, ["spring"]], ["Po1", 2, ["spring"]], ["Po2", 2, ["summer", "fall"]],
  ["O", 3, ["spring", "fall"]], ["N1", 3, ["summer"]], ["N2", 3, ["fall"]],
  ["Qu", 4, ["summer"]], ["Pu", 4, ["summer"]], ["Sa", 4, ["summer"]], ["Bu", 4, ["summer"]],
].map(([code, g, seasons], i) => ({
  code: code as string,
  geo_group: g as number,
  seasons: seasons as Season[],
  sort_order: i + 1,
  normals: Array.from({ length: 12 }, (_, m) => {
    const swing = Math.cos(((m - 6) / 12) * 2 * Math.PI) * (g === 4 ? -10 : 10);
    const base = 60 + i * 1.5;
    return [Math.round(base + swing + 10), Math.round(base + swing - 5)] as [number, number];
  }),
}));

/* ------------------------------------------------------------------------ */
/* Button #5: year-long "trails" (owner, 2026-11-22 23:49). Codes only; the */
/* reunion cities use their public names.                                  */
/* ------------------------------------------------------------------------ */

export type TrailStopCode = string; // a location code, or "Orlando" / "Panama"
export interface TrailStop { code: TrailStopCode; from: string; to: string } // 2027 "MM-DD"
export interface Trail { id: string; label: string; group: "fav" | "more"; stops: TrailStop[] }

export const TRAIL_GROUPS: { id: Trail["group"]; label: string }[] = [
  { id: "fav", label: "Favorites" },
  { id: "more", label: "Worth considering" },
];

export const TRAILS: Trail[] = [
  // Owner's favourites first, then the others; each group in the owner's chosen order (2026-11-23).
  {
    id: "D", label: "Option D", group: "fav",
    stops: [
      { code: "Orlando", from: "01-01", to: "02-01" },
      { code: "B", from: "02-01", to: "04-15" },
      { code: "Orlando", from: "04-15", to: "06-01" },
      { code: "Qu", from: "06-01", to: "08-29" },
      { code: "Bu", from: "08-30", to: "11-07" },
      { code: "Sa", from: "10-01", to: "11-07" },
      { code: "Orlando", from: "11-07", to: "12-31" },
    ],
  },
  {
    id: "C", label: "Option C", group: "fav",
    stops: [
      { code: "Orlando", from: "01-01", to: "02-01" },
      { code: "B", from: "02-01", to: "04-15" },
      { code: "Orlando", from: "04-15", to: "06-01" },
      { code: "I", from: "06-01", to: "08-29" },
      { code: "Po1", from: "08-30", to: "11-27" },
      { code: "Po2", from: "08-30", to: "11-27" },
      { code: "Orlando", from: "11-28", to: "12-31" },
    ],
  },
  {
    id: "F", label: "Option F", group: "fav",
    stops: [
      { code: "Orlando", from: "01-01", to: "02-01" },
      { code: "B", from: "02-01", to: "04-04" },
      { code: "Bu", from: "04-05", to: "06-12" },
      { code: "Qu", from: "06-13", to: "09-10" },
      { code: "Sa", from: "09-11", to: "11-07" },
      { code: "Orlando", from: "11-08", to: "12-31" },
    ],
  },
  {
    id: "K", label: "Option K", group: "fav",
    stops: [
      { code: "Orlando", from: "01-01", to: "02-01" },
      { code: "B", from: "02-01", to: "04-15" },
      { code: "Orlando", from: "04-15", to: "05-15" },
      { code: "O", from: "05-16", to: "07-04" },
      { code: "I", from: "07-05", to: "10-02" },
      { code: "Po1", from: "10-03", to: "11-27" },
      { code: "Po2", from: "10-03", to: "11-27" },
      { code: "Orlando", from: "11-28", to: "12-31" },
    ],
  },
  {
    id: "J", label: "Option J", group: "fav",
    stops: [
      { code: "Orlando", from: "01-01", to: "02-01" },
      { code: "B", from: "02-01", to: "04-05" },
      { code: "Bu", from: "04-06", to: "06-08" },
      { code: "I", from: "06-09", to: "09-06" },
      { code: "Po1", from: "09-07", to: "10-29" },
      { code: "Po2", from: "09-07", to: "10-29" },
      { code: "Orlando", from: "10-30", to: "12-31" },
    ],
  },
  {
    id: "E", label: "Option E", group: "more",
    stops: [
      { code: "Orlando", from: "01-01", to: "02-01" },
      { code: "B", from: "02-01", to: "04-15" },
      { code: "Orlando", from: "04-15", to: "06-01" },
      { code: "O", from: "06-01", to: "07-01" },
      { code: "N1", from: "07-02", to: "08-31" },
      { code: "O", from: "09-01", to: "10-27" },
      { code: "N2", from: "10-28", to: "11-14" },
      { code: "Orlando", from: "11-15", to: "12-31" },
    ],
  },
  {
    id: "B", label: "Option B", group: "more",
    stops: [
      { code: "Orlando", from: "01-01", to: "02-01" },
      { code: "Se", from: "02-01", to: "05-01" },
      { code: "I", from: "05-02", to: "07-30" },
      { code: "Po1", from: "07-31", to: "10-28" },
      { code: "Po2", from: "07-31", to: "10-28" },
      { code: "Orlando", from: "10-29", to: "12-31" },
    ],
  },
  {
    id: "H", label: "Option H", group: "more",
    stops: [
      { code: "Orlando", from: "01-01", to: "02-01" },
      { code: "Se", from: "02-01", to: "05-01" },
      { code: "I", from: "05-02", to: "07-30" },
      { code: "Po2", from: "08-01", to: "08-31" },
      { code: "Al", from: "09-02", to: "11-30" },
      { code: "Orlando", from: "12-01", to: "12-31" },
    ],
  },
  {
    id: "G", label: "Option G", group: "more",
    stops: [
      { code: "Orlando", from: "01-01", to: "02-01" },
      { code: "B", from: "02-01", to: "03-14" },
      { code: "Se", from: "03-15", to: "05-14" },
      { code: "Po2", from: "05-15", to: "05-31" },
      { code: "I", from: "06-01", to: "08-29" },
      { code: "Al", from: "09-02", to: "10-31" },
      { code: "Orlando", from: "11-01", to: "12-31" },
    ],
  },
];

export const trailKey = (i: number, which: "hi" | "lo") => `t_${i}_${which}`;
const fmtMD = (md: string) => new Date(Date.UTC(2027, +md.slice(0, 2) - 1, +md.slice(3, 5))).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const stopRange = (s: TrailStop) => `${fmtMD(s.from)} – ${fmtMD(s.to)}`;

/** The [high, low] table for a trail stop: a location's normals, or a reunion city's. */
export function stopNormals(code: TrailStopCode, places: WeatherPlace[], cityNormals: Record<string, [number, number][]>) {
  return cityNormals[code] ?? places.find((p) => p.code === code)?.normals ?? null;
}

/** Adds one high/low series per trail stop, drawn only over that stop's days. */
export function addTrailToChart(
  points: ChartPoint[], trail: Trail | null, places: WeatherPlace[], cityNormals: Record<string, [number, number][]>,
): ChartPoint[] {
  if (!trail) return points;
  const rows = new Map<number, Record<string, number>>();
  for (const p of points) rows.set(p.t, { ...(p as unknown as Record<string, number>) });
  const ensure = (t: number) => rows.get(t) ?? (rows.set(t, { t }), rows.get(t)!);
  const spans = trail.stops.map((s) => [toDay(`2027-${s.from}`), toDay(`2027-${s.to}`)] as [number, number]);
  for (const [a, b] of spans) { for (let t = a; t < b; t += 7 * DAY_MS) ensure(t); ensure(b); }
  const all = Array.from(rows.values());
  trail.stops.forEach((s, i) => {
    const table = stopNormals(s.code, places, cityNormals);
    if (!table) return;
    const [a, b] = spans[i];
    for (const row of all) {
      if (row.t < a || row.t > b) continue;
      const v = interpolateMonthly(table, dayIso(row.t));
      row[trailKey(i, "hi")] = Math.round(v.high * 10) / 10;
      row[trailKey(i, "lo")] = Math.round(v.low * 10) / 10;
    }
  });
  return all.sort((x, y) => x.t - y.t) as unknown as ChartPoint[];
}

/** Average high/low over each stop's days, for the table under the chart. */
export function trailRows(trail: Trail, places: WeatherPlace[], cityNormals: Record<string, [number, number][]>) {
  return trail.stops.map((s) => {
    const table = stopNormals(s.code, places, cityNormals);
    let hi = 0, lo = 0, n = 0;
    if (table) {
      for (let t = toDay(`2027-${s.from}`); t <= toDay(`2027-${s.to}`); t += DAY_MS) {
        const v = interpolateMonthly(table, dayIso(t));
        hi += v.high; lo += v.low; n++;
      }
    }
    return { code: s.code, range: stopRange(s), high: n ? Math.round(hi / n) : null, low: n ? Math.round(lo / n) : null };
  });
}

/* ------------------------------------------------------------------------ */
/* Trail cost estimates (owner, 2026-11-23). The numbers come only from      */
/* weather_trail_costs(pin) after the Maintenance PIN; nothing is stored     */
/* here. Orlando lodging is $0.                                              */
/* ------------------------------------------------------------------------ */

export interface CostRow { kind: "lodging" | "fare"; code_a: string; code_b: string | null; usd: number }
export const TRAVELERS = 2;
const HOME = "Orlando";

export interface TrailCost {
  travel: number;
  lodging: number;
  total: number;
  /** Per stop: lodging over its days, and the fare(s) to get there (all travelers). */
  stops: { lodging: number; travelIn: number | null }[];
  /** Legs with no fare in the table (counted as $0 in the totals). */
  missing: string[];
}

export function trailCost(trail: Trail, rows: CostRow[]): TrailCost {
  const rent = new Map<string, number>();
  const fares = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === "lodging") rent.set(r.code_a, r.usd);
    else if (r.code_b) { fares.set(`${r.code_a}|${r.code_b}`, r.usd); fares.set(`${r.code_b}|${r.code_a}`, r.usd); }
  }
  const missing: string[] = [];
  const fare = (a: string, b: string) => {
    if (a === b) return 0;
    const f = fares.get(`${a}|${b}`);
    if (f == null) { missing.push(`${a}→${b}`); return null; }
    return f * TRAVELERS;
  };

  // Lodging: one unit at a time. On a day covered by several stops (parallel stops,
  // or a hand-over day), the day's rent is the average of those stops' daily rents.
  const spans = trail.stops.map((s) => [toDay(`2027-${s.from}`), toDay(`2027-${s.to}`)] as [number, number]);
  const lodging = trail.stops.map(() => 0);
  const first = Math.min(...spans.map((s) => s[0])), last = Math.max(...spans.map((s) => s[1]));
  for (let t = first; t <= last; t += DAY_MS) {
    const active = spans.map((sp, i) => (t >= sp[0] && t <= sp[1] ? i : -1)).filter((i) => i >= 0);
    if (!active.length) continue;
    for (const i of active) {
      const code = trail.stops[i].code;
      const perDay = code === HOME ? 0 : (rent.get(code) ?? 0) * 12 / 365;
      lodging[i] += perDay / active.length;
    }
  }

  // Travel: one leg into each stop from the stop before it (list order).
  const travelIn: (number | null)[] = trail.stops.map((s, i) => (i === 0 ? 0 : fare(trail.stops[i - 1].code, s.code)));
  const travel = travelIn.reduce<number>((a, b) => a + (b ?? 0), 0);
  const lodgingTotal = lodging.reduce((a, b) => a + b, 0);
  return {
    travel: Math.round(travel),
    lodging: Math.round(lodgingTotal),
    total: Math.round(travel + lodgingTotal),
    stops: trail.stops.map((_, i) => ({ lodging: Math.round(lodging[i]), travelIn: travelIn[i] })),
    missing,
  };
}

export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
