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
 * Owner-set months for some codes (2026-11-21, 22:10 ET), as 2027 "MM-DD" ranges.
 * Codes not listed here use the months of their periods (spring/summer/fall).
 */
export const MONTH_WINDOWS: Record<string, [string, string][]> = {
  I: [["06-01", "09-30"]],
  Se: [["01-01", "12-31"]],
  Po1: [["01-01", "12-31"]],
  Bu: [["01-01", "12-31"]],
  Qu: [["01-01", "12-31"]],
  Pu: [["01-01", "05-31"], ["09-01", "12-31"]],
  Sa: [["02-01", "05-31"], ["09-01", "12-01"]],
  Al: [["02-01", "06-30"], ["09-01", "11-30"]],
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

export function visiblePlaces(places: WeatherPlace[], activeGroups: Set<number>, activeSeasons: Set<Season>) {
  return places
    .filter((p) => activeGroups.has(p.geo_group))
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
