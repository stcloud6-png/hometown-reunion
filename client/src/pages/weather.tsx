import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WeatherRow } from "@/components/weather-corner";
import { supabaseRest } from "@/lib/reunion";
import { DEMO_WEATHER } from "@/lib/use-reunion-data";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { buildChart, CITIES, dayIso, PRIOR_DAYS, type ChartPoint, type City } from "@/lib/weather-estimate";

const STUB = import.meta.env.VITE_STUB_DATA === "true";

// Categorical slots 1–2 of the validated chart palette (light / dark steps).
const COLORS = {
  light: { "Orlando, FL": "#2a78d6", "Panama City": "#eb6834" },
  dark: { "Orlando, FL": "#3987e5", "Panama City": "#d95926" },
} as const;
const SHORT: Record<City, string> = { "Orlando, FL": "Orlando", "Panama City": "Panama" };
const KEY: Record<City, "o" | "p"> = { "Orlando, FL": "o", "Panama City": "p" };

const fmtAxis = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const SERIES_LABEL: Record<string, string> = {
  oHigh: "Orlando high", oLow: "Orlando low", pHigh: "Panama high", pLow: "Panama low",
  oHighEst: "Orlando high (est.)", oLowEst: "Orlando low (est.)", pHighEst: "Panama high (est.)", pLowEst: "Panama low (est.)",
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number; color: string }[]; label?: number }) {
  if (!active || !payload?.length || label == null) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{fmtDay(label)}</p>
      {payload.filter((p) => p.value != null).map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-muted-foreground">{SERIES_LABEL[p.dataKey] ?? p.dataKey}</span>
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

  useEffect(() => {
    if (STUB) { setRows(DEMO_WEATHER); return; }
    supabaseRest<WeatherRow[]>("/weather_daily?select=city,observed_on,temp_f,high_f,low_f,weather_code,fetched_at&order=observed_on.asc")
      .then(setRows)
      .catch(() => { setFailed(true); setRows([]); });
  }, []);

  const chart = useMemo(() => buildChart(rows ?? []), [rows]);
  const firstT = chart.points[0]?.t;
  const lastT = chart.points[chart.points.length - 1]?.t;
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
  const collectedDays = chart.offsets["Orlando, FL"].days;

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
          <strong className="text-foreground">4 Jul 2027</strong>.
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
            <CardTitle className="text-base">Daily high &amp; low, °F</CardTitle>
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
            </div>
          </CardHeader>
          <CardContent>
            {rows == null ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Loading weather…</p>
            ) : (
              <div className="h-[380px] w-full sm:h-[440px]" data-testid="weather-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart.points} margin={{ top: 28, right: 60, bottom: 4, left: -8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                    <XAxis
                      dataKey="t" type="number" scale="time" domain={[firstT ?? "auto", lastT ?? "auto"]}
                      ticks={monthTicks} tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} minTickGap={24}
                    />
                    <YAxis
                      domain={[40, 100]} ticks={[40, 50, 60, 70, 80, 90, 100]} unit="°"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={44}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }} />
                    {chart.milestones.map((m) => (
                      <ReferenceLine
                        key={m.date} x={m.t} stroke="hsl(var(--foreground))" strokeOpacity={0.5} strokeDasharray="4 4"
                        label={{ value: m.label, position: "top", fontSize: 11, fill: "hsl(var(--foreground))" }}
                      />
                    ))}
                    {CITIES.flatMap((c) => {
                      const k = KEY[c];
                      const common = { stroke: color[c], strokeWidth: 2, isAnimationActive: false, connectNulls: true } as const;
                      return [
                        <Line key={`${k}High`} dataKey={`${k}High`} {...common} dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }} activeDot={{ r: 5 }} />,
                        <Line key={`${k}Low`} dataKey={`${k}Low`} {...common} dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--card))" }} activeDot={{ r: 5 }} />,
                        <Line key={`${k}HighEst`} dataKey={`${k}HighEst`} {...common} strokeDasharray="6 4" strokeOpacity={0.85} dot={false} activeDot={{ r: 4 }}
                          label={(props: { x: number; y: number; index: number }) =>
                            props.index === chart.points.length - 1
                              ? <text key="lbl" x={props.x + 6} y={props.y} dy={4} fontSize={11} fill="hsl(var(--foreground))">{SHORT[c]}</text>
                              : <g key={props.index} />}
                        />,
                        <Line key={`${k}LowEst`} dataKey={`${k}LowEst`} {...common} strokeDasharray="6 4" strokeOpacity={0.85} dot={false} activeDot={{ r: 4 }} />,
                      ];
                    })}
                    {/* Milestone markers: one ring per city high/low, sitting on the estimate line. */}
                    {chart.milestones.flatMap((m) => m.cities.flatMap((c) => [
                      <ReferenceDot key={`${m.date}-${c.city}-h`} x={m.t} y={c.high} r={6} fill={color[c.city]} stroke="hsl(var(--card))" strokeWidth={2} />,
                      <ReferenceDot key={`${m.date}-${c.city}-l`} x={m.t} y={c.low} r={6} fill={color[c.city]} stroke="hsl(var(--card))" strokeWidth={2} />,
                    ]))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {failed && <p className="mt-2 text-xs text-muted-foreground">Couldn't load the collected readings just now; showing the estimate only.</p>}
          </CardContent>
        </Card>

        <div className="mt-6 space-y-2 text-sm text-muted-foreground" data-testid="weather-method">
          <p className="font-medium text-foreground">How the estimate works</p>
          <p>
            The site has collected {collectedDays} day{collectedDays === 1 ? "" : "s"} of readings so far (since Nov 19, 2026) — too few
            for a straight-line trend, which would run off the chart within weeks. So each estimate starts from the
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
      </main>
    </div>
  );
}
