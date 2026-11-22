import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock, LockOpen } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { WeatherRow } from "@/components/weather-corner";
import { supabaseRest, supabaseRpc } from "@/lib/reunion";
import { DEMO_WEATHER } from "@/lib/use-reunion-data";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { buildChart, CITIES, dayIso, PRIOR_DAYS, type ChartPoint, type City } from "@/lib/weather-estimate";
import {
  addPlacesToChart, DEMO_PLACES, GEO_GROUPS, monthlyRows, placeKey, SEASONS, visiblePlaces,
  type HiLo, type Season, type WeatherPlace,
} from "@/lib/weather-places";

const STUB = import.meta.env.VITE_STUB_DATA === "true";

// Categorical slots 1–2 of the validated chart palette (light / dark steps).
const COLORS = {
  light: { "Orlando, FL": "#2a78d6", "Panama City": "#eb6834" },
  dark: { "Orlando, FL": "#3987e5", "Panama City": "#d95926" },
} as const;
// Location buttons #1–#4: categorical slots 3–6 of the same validated palette (one colour per button group).
const GROUP_COLORS = {
  light: { 1: "#1baf7a", 2: "#eda100", 3: "#e87ba4", 4: "#008300" },
  dark: { 1: "#199e70", 2: "#c98500", 3: "#d55181", 4: "#0ca30c" },
} as Record<"light" | "dark", Record<number, string>>;
const SHORT: Record<City, string> = { "Orlando, FL": "Orlando", "Panama City": "Panama" };
const KEY: Record<City, "o" | "p"> = { "Orlando, FL": "o", "Panama City": "p" };

const fmtAxis = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const SERIES_LABEL: Record<string, string> = {
  oHigh: "Orlando high", oLow: "Orlando low", pHigh: "Panama high", pLow: "Panama low",
  oHighEst: "Orlando high (est.)", oLowEst: "Orlando low (est.)", pHighEst: "Panama high (est.)", pLowEst: "Panama low (est.)",
};

function ChartTooltip({ active, payload, label, placeLabel }: { active?: boolean; payload?: { dataKey: string; value: number; color: string }[]; label?: number; placeLabel: (code: string) => string }) {
  if (!active || !payload?.length || label == null) return null;
  const nameOf = (key: string) => {
    const m = key.match(/^x_(.+)_(hi|lo)$/);
    return m ? `${placeLabel(m[1])} ${m[2] === "hi" ? "high" : "low"} (est.)` : SERIES_LABEL[key] ?? key;
  };
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{fmtDay(label)}</p>
      {payload.filter((p) => p.value != null).map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-muted-foreground">{nameOf(p.dataKey)}</span>
          <span className="ml-auto font-medium tabular-nums">{Math.round(p.value)}°F</span>
        </p>
      ))}
    </div>
  );
}

export default function WeatherPage() {
  const [rows, setRows] = useState<WeatherRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { dark } = useDarkMode(); // applies the visitor's saved light/dark choice
  const color = dark ? COLORS.dark : COLORS.light;
  const groupColor = dark ? GROUP_COLORS.dark : GROUP_COLORS.light;
  const [places, setPlaces] = useState<WeatherPlace[]>([]);
  const [activeGroups, setActiveGroups] = useState<Set<number>>(new Set());
  const [activeSeasons, setActiveSeasons] = useState<Set<Season>>(new Set(SEASONS.map((x) => x.id)));
  const [hiLo, setHiLo] = useState<HiLo>("both");
  // Short names: only after the database accepts the Maintenance PIN. Kept in memory, never stored.
  const [names, setNames] = useState<Record<string, string> | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const placeLabel = (code: string) => (names?.[code] ? `${code} · ${names[code]}` : code);

  async function submitPin() {
    setPinBusy(true);
    setPinError(null);
    try {
      const res = STUB
        ? (pin === "0000" ? DEMO_PLACES.map((p) => ({ code: p.code, short_name: `Demo-${p.code}` })) : Promise.reject(new Error("invalid pin")))
        : await supabaseRpc<{ code: string; short_name: string }[]>("weather_place_names", { p_pin: pin });
      const list = await res;
      setNames(Object.fromEntries(list.map((r) => [r.code, r.short_name])));
      setPinOpen(false);
      setPin("");
    } catch {
      setPinError("That PIN wasn't accepted.");
    } finally {
      setPinBusy(false);
    }
  }

  useEffect(() => {
    if (STUB) { setRows(DEMO_WEATHER); setPlaces(DEMO_PLACES); return; }
    supabaseRpc<WeatherPlace[]>("weather_places_public").then(setPlaces).catch(() => setPlaces([]));
    supabaseRest<WeatherRow[]>("/weather_daily?select=city,observed_on,temp_f,high_f,low_f,weather_code,fetched_at&order=observed_on.asc")
      .then(setRows)
      .catch(() => { setFailed(true); setRows([]); });
  }, []);

  const chart = useMemo(() => buildChart(rows ?? []), [rows]);
  const visible = useMemo(() => visiblePlaces(places, activeGroups, activeSeasons), [places, activeGroups, activeSeasons]);
  const points = useMemo(() => addPlacesToChart(chart.points, visible), [chart.points, visible]);
  const placeTable = useMemo(() => monthlyRows(visible), [visible]);
  const showHigh = hiLo !== "low";
  const showLow = hiLo !== "high";
  const firstT = points[0]?.t;
  const lastT = points[points.length - 1]?.t;
  // Last index of each unbroken run of a series, for its code label.
  const rowsAny = points as unknown as Record<string, number | undefined>[];
  const segmentEnds = (key: string) => {
    const ends = new Set<number>();
    rowsAny.forEach((r, i) => { if (r[key] != null && rowsAny[i + 1]?.[key] == null) ends.add(i); });
    return ends;
  };
  // Labels that end on the same day are spread apart (≥ ~11px) so codes don't sit on top of each other.
  const labelNudge = useMemo(() => {
    const PX_PER_DEG = 5.2, MIN_GAP_DEG = 2.2;
    const keys: string[] = [];
    for (const c of CITIES) keys.push(hiLo === "low" ? `${KEY[c]}LowEst` : `${KEY[c]}HighEst`);
    for (const { place } of visible) keys.push(placeKey(place.code, hiLo === "low" ? "lo" : "hi"));
    const byIndex = new Map<number, { key: string; v: number }[]>();
    for (const key of keys) {
      const isCity = !key.startsWith("x_");
      rowsAny.forEach((r, i) => {
        const end = isCity ? i === rowsAny.length - 1 : r[key] != null && rowsAny[i + 1]?.[key] == null;
        if (end && r[key] != null) (byIndex.get(i) ?? byIndex.set(i, []).get(i)!).push({ key, v: r[key]! });
      });
    }
    const out = new Map<string, number>();
    byIndex.forEach((labels, i) => {
      labels.sort((a, b) => b.v - a.v); // top to bottom
      let prev = Infinity;
      for (const l of labels) {
        const placed = Math.min(l.v, prev - MIN_GAP_DEG);
        out.set(`${l.key}@${i}`, (l.v - placed) * PX_PER_DEG);
        prev = placed;
      }
    });
    return out;
  }, [rowsAny, visible, hiLo]);
  const nudge = (key: string, i: number) => labelNudge.get(`${key}@${i}`) ?? 0;
  // One tick on the 1st of each month in range.
  const monthTicks: number[] = [];
  if (firstT != null && lastT != null) {
    const d = new Date(firstT);
    for (let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); m <= lastT; ) {
      monthTicks.push(m);
      const md = new Date(m);
      m = Date.UTC(md.getUTCFullYear(), md.getUTCMonth() + 1, 1);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <a href="#/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="link-weather-back">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to CZR BHS87
        </a>
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Plan your Reunion Weather</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Daily highs and lows the site collects each morning for Orlando and Panama City, with an estimate
          out to two milestones: <strong className="text-foreground">15 Jan 2027</strong> and{" "}
          <strong className="text-foreground">4 Jul 2027</strong>. Use the period and location buttons on the
          chart to add other places' estimated temperatures.
        </p>

        {/* Milestone estimates: the headline numbers, read before the chart. */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2" data-testid="weather-milestones">
          {chart.milestones.map((m) => (
            <Card key={m.date}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{m.label} <span className="font-normal text-muted-foreground">· estimate</span></CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {m.cities.map((c) => (
                  <div key={c.city} className="flex flex-wrap items-baseline gap-x-2 text-sm" data-testid={`milestone-${m.date}-${SHORT[c.city]}`}>
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color[c.city] }} aria-hidden="true" />
                    <span className="w-20 font-medium">{SHORT[c.city]}</span>
                    <span className="whitespace-nowrap tabular-nums">High <strong>{c.high}°F</strong> · Low <strong>{c.low}°F</strong></span>
                    <span className="w-full pl-[1.15rem] text-xs text-muted-foreground tabular-nums sm:ml-auto sm:w-auto sm:pl-0">normal {c.normalHigh}° / {c.normalLow}°</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">Daily high &amp; low, °F</CardTitle>
              <Button
                variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => (names ? setNames(null) : setPinOpen(true))}
                aria-label={names ? "Hide location names" : "Maintenance: show location names"}
                data-testid="button-weather-pin"
              >
                {names ? <LockOpen className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
              </Button>
            </div>
            {/* Filters, one row: periods · locations · high/low. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2" data-testid="weather-controls">
              <div className="flex flex-wrap gap-1" role="group" aria-label="Weather periods">
                {SEASONS.map((x) => (
                  <Button
                    key={x.id} size="sm" variant={activeSeasons.has(x.id) ? "default" : "outline"} className="h-8 rounded-full px-3 text-xs"
                    aria-pressed={activeSeasons.has(x.id)} onClick={() => setActiveSeasons((cur) => toggle(cur, x.id))}
                    data-testid={`button-season-${x.id}`}
                  >
                    {x.label} <span className="ml-1 opacity-70">({x.months})</span>
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Locations">
                {GEO_GROUPS.map((g) => {
                  const codes = places.filter((p) => p.geo_group === g).map((p) => p.code);
                  const on = activeGroups.has(g);
                  return (
                    <Button
                      key={g} size="sm" variant={on ? "default" : "outline"} className="h-8 gap-1.5 rounded-full px-3 text-xs"
                      aria-pressed={on} disabled={!codes.length} onClick={() => setActiveGroups((cur) => toggle(cur, g))}
                      title={codes.join(", ")} data-testid={`button-geo-${g}`}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-background" style={{ background: groupColor[g] }} aria-hidden="true" />
                      #{g}
                    </Button>
                  );
                })}
              </div>
              <div className="inline-flex rounded-full border p-0.5" role="group" aria-label="Show highs, lows or both">
                {(["both", "high", "low"] as HiLo[]).map((v) => (
                  <button
                    key={v} type="button" aria-pressed={hiLo === v} onClick={() => setHiLo(v)}
                    className={cn("rounded-full px-3 py-1 text-xs capitalize", hiLo === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                    data-testid={`button-hilo-${v}`}
                  >
                    {v === "both" ? "High & low" : v}
                  </button>
                ))}
              </div>
            </div>
            {/* Legend: identity never rests on colour alone (city names + line style). */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-xs text-muted-foreground" data-testid="weather-legend">
              {CITIES.map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5" style={{ background: color[c] }} aria-hidden="true" />
                  {SHORT[c]}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 border-t-2 border-foreground/70" aria-hidden="true" /> collected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 border-t-2 border-dashed border-foreground/70" aria-hidden="true" /> estimate
              </span>
              {visible.map(({ place }) => (
                <span key={place.code} className="flex items-center gap-1.5" data-testid={`legend-place-${place.code}`}>
                  <span className="inline-block h-0.5 w-4" style={{ background: groupColor[place.geo_group] }} aria-hidden="true" />
                  {placeLabel(place.code)}
                </span>
              ))}
              {visible.length > 0 && showLow && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-2 border-dotted border-foreground/70" aria-hidden="true" /> location low
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {rows == null ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Loading weather…</p>
            ) : (
              <div className="h-[380px] w-full sm:h-[440px]" data-testid="weather-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 28, right: 72, bottom: 4, left: -8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                    <XAxis
                      dataKey="t" type="number" scale="time" domain={[firstT ?? "auto", lastT ?? "auto"]}
                      ticks={monthTicks} tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} minTickGap={24}
                    />
                    <YAxis
                      domain={[30, 100]} ticks={[30, 40, 50, 60, 70, 80, 90, 100]} unit="°"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44}
                    />
                    <Tooltip content={<ChartTooltip placeLabel={placeLabel} />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }} />
                    {chart.milestones.map((m) => (
                      <ReferenceLine
                        key={m.date} x={m.t} stroke="hsl(var(--foreground))" strokeOpacity={0.5} strokeDasharray="4 4"
                        label={{ value: m.label, position: "top", fontSize: 11, fill: "hsl(var(--foreground))" }}
                      />
                    ))}
                    {CITIES.flatMap((c) => {
                      const k = KEY[c];
                      const common = { stroke: color[c], strokeWidth: 2, isAnimationActive: false, connectNulls: true } as const;
                      const labelKey = hiLo === "low" ? `${k}LowEst` : `${k}HighEst`;
                      const endLabel = (props: { x: number; y: number; index: number }) =>
                        props.index === points.length - 1
                          ? <text key="lbl" x={props.x + 6} y={props.y + nudge(labelKey, props.index)} dy={4} fontSize={11} fill="hsl(var(--foreground))">{SHORT[c]}</text>
                          : <g key={props.index} />;
                      return [
                        showHigh && <Line key={`${k}High`} dataKey={`${k}High`} {...common} dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }} activeDot={{ r: 5 }} />,
                        showLow && <Line key={`${k}Low`} dataKey={`${k}Low`} {...common} dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }} activeDot={{ r: 5 }} />,
                        showHigh && <Line key={`${k}HighEst`} dataKey={`${k}HighEst`} {...common} strokeDasharray="6 4" strokeOpacity={0.85} dot={false} activeDot={{ r: 4 }} label={endLabel} />,
                        showLow && <Line key={`${k}LowEst`} dataKey={`${k}LowEst`} {...common} strokeDasharray="6 4" strokeOpacity={0.85} dot={false} activeDot={{ r: 4 }} label={hiLo === "low" ? endLabel : undefined} />,
                      ].filter(Boolean);
                    })}
                    {/* Planning locations: thin lines inside their periods only, labelled with their code. */}
                    {visible.flatMap(({ place }) => {
                      const c = groupColor[place.geo_group];
                      const which: ("hi" | "lo")[] = [...(showHigh ? ["hi" as const] : []), ...(showLow ? ["lo" as const] : [])];
                      return which.map((w) => {
                        const key = placeKey(place.code, w);
                        const ends = segmentEnds(key);
                        const labelHere = w === "hi" || !showHigh;
                        return (
                          <Line
                            key={key} dataKey={key} stroke={c} strokeWidth={1.5} strokeDasharray={w === "lo" ? "2 3" : undefined}
                            dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} connectNulls={false}
                            label={(props: { x: number; y: number; index: number }) =>
                              labelHere && ends.has(props.index)
                                ? <text key={`l${props.index}`} x={props.x + 4} y={props.y + nudge(key, props.index)} dy={4} fontSize={10} fill="hsl(var(--foreground))">{placeLabel(place.code)}</text>
                                : <g key={props.index} />}
                          />
                        );
                      });
                    })}
                    {/* Milestone markers: one ring per city high/low, sitting on the estimate line. */}
                    {chart.milestones.flatMap((m) => m.cities.flatMap((c) => [
                      showHigh && <ReferenceDot key={`${m.date}-${c.city}-h`} x={m.t} y={c.high} r={6} fill={color[c.city]} stroke="hsl(var(--card))" strokeWidth={2} />,
                      showLow && <ReferenceDot key={`${m.date}-${c.city}-l`} x={m.t} y={c.low} r={6} fill={color[c.city]} stroke="hsl(var(--card))" strokeWidth={2} />,
                    ].filter(Boolean)))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {failed && <p className="mt-2 text-xs text-muted-foreground">Couldn't load the collected readings just now; showing the estimate only.</p>}
            {placeTable.length > 0 && (
              <div className="mt-4 overflow-x-auto" data-testid="weather-place-table">
                <table className="w-full text-xs tabular-nums">
                  <caption className="pb-1 text-left text-muted-foreground">Estimated average high / low, °F, for each location’s months</caption>
                  <tbody>
                    {placeTable.map((r) => (
                      <tr key={r.code} className="border-t">
                        <th scope="row" className="whitespace-nowrap py-1 pr-3 text-left font-medium">
                          <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: groupColor[r.group] }} aria-hidden="true" />
                          {placeLabel(r.code)}
                        </th>
                        {r.months.map((m) => (
                          <td key={m.label} className="whitespace-nowrap py-1 pr-3">
                            <span className="text-muted-foreground">{m.label}</span>{" "}
                            {hiLo === "low" ? `${m.low}°` : hiLo === "high" ? `${m.high}°` : `${m.high}° / ${m.low}°`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 space-y-2 text-sm text-muted-foreground" data-testid="weather-method">
          <p className="font-medium text-foreground">How the estimate works</p>
          <p>
            Each estimate starts from the
            long-term normal for that day of the year and is nudged by how far the site's own readings have recently run
            above or below normal. With few days collected the nudge is small; it grows as readings build up
            (weight = days ÷ (days + {PRIOR_DAYS})). The estimate refreshes every morning with the new reading.
          </p>
          <p className="text-xs">
            Normals: Orlando — NWS Melbourne, Orlando Intl 1991–2020. Panama City — WeatherSpark long-term averages.
            Readings: Open-Meteo, collected daily at about 6:25 am local. For planning only, not a forecast.
          </p>
        </div>

        {/* Table view of the collected readings (the chart's accessible twin). */}
        <details className="mt-6 rounded-lg border p-4" data-testid="weather-table">
          <summary className="cursor-pointer text-sm font-medium">Collected readings (table)</summary>
          <table className="mt-3 w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1 font-medium">Date</th>{CITIES.map((c) => <th key={c} className="py-1 font-medium">{SHORT[c]} high / low</th>)}</tr>
            </thead>
            <tbody>
              {chart.points.filter((p: ChartPoint) => p.oHigh != null || p.pHigh != null).reverse().map((p) => (
                <tr key={p.t} className="border-t">
                  <td className="py-1">{dayIso(p.t)}</td>
                  <td className="py-1">{p.oHigh != null ? `${Math.round(p.oHigh)}° / ${Math.round(p.oLow ?? NaN)}°` : "—"}</td>
                  <td className="py-1">{p.pHigh != null ? `${Math.round(p.pHigh)}° / ${Math.round(p.pLow ?? NaN)}°` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <Dialog open={pinOpen} onOpenChange={(o) => { setPinOpen(o); if (!o) { setPin(""); setPinError(null); } }}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Maintenance</DialogTitle>
              <DialogDescription>Enter the Maintenance PIN to show the location names.</DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); void submitPin(); }} className="space-y-2">
              <Input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} aria-label="Maintenance PIN" data-testid="input-weather-pin" />
              {pinError && <p className="text-xs text-destructive">{pinError}</p>}
              <DialogFooter>
                <Button type="submit" size="sm" disabled={!pin || pinBusy} data-testid="button-weather-pin-submit">Show names</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
