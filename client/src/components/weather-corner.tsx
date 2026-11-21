import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** One stored daily reading (public.weather_daily). Info only. */
export interface WeatherRow {
  city: string;
  observed_on: string;
  temp_f: number | string | null;
  high_f: number | string | null;
  low_f: number | string | null;
  weather_code: number | null;
  fetched_at: string;
}

/** WMO weather code (Open-Meteo) → icon + words. */
function describe(code: number | null): { Icon: typeof Sun; text: string } {
  if (code == null) return { Icon: Cloud, text: "" };
  if (code === 0) return { Icon: Sun, text: "Clear" };
  if (code <= 2) return { Icon: CloudSun, text: "Partly cloudy" };
  if (code === 3) return { Icon: Cloud, text: "Cloudy" };
  if (code <= 48) return { Icon: CloudFog, text: "Fog" };
  if (code <= 57) return { Icon: CloudDrizzle, text: "Drizzle" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { Icon: CloudRain, text: "Rain" };
  if (code <= 77 || code === 85 || code === 86) return { Icon: CloudSnow, text: "Snow" };
  return { Icon: CloudLightning, text: "Thunderstorms" };
}

const num = (v: number | string | null) => (v == null || v === "" ? null : Math.round(Number(v)));
const toC = (f: number) => Math.round(((f - 32) * 5) / 9);
const SHORT: Record<string, string> = { "Orlando, FL": "Orlando", "Panama City": "Panama" };

/** Latest stored reading per city, shown small in a corner of the splash page. */
export function WeatherCorner({ rows, className }: { rows: WeatherRow[]; className?: string }) {
  const latest = new Map<string, WeatherRow>();
  for (const r of rows) {
    const cur = latest.get(r.city);
    if (!cur || r.observed_on > cur.observed_on) latest.set(r.city, r);
  }
  const cities = ["Orlando, FL", "Panama City"].map((c) => latest.get(c)).filter(Boolean) as WeatherRow[];
  if (!cities.length) return null;
  return (
    // The whole corner (label + temps) opens the Reunion Weather chart page.
    <a href="#/weather" className={cn("group flex flex-col items-start gap-1 no-underline", className)} aria-label="Current temps – open the Reunion Weather chart" data-testid="link-weather-page">
    <span className="pl-1 text-[11px] font-medium text-muted-foreground group-hover:text-foreground group-hover:underline underline-offset-2" data-testid="text-weather-label">
      Current Temps – plan your Reunion Weather
    </span>
    <div className="flex items-center gap-3 rounded-full border bg-card/80 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur transition-colors group-hover:border-foreground/40" data-testid="weather-corner">
      {cities.map((r) => {
        const { Icon, text } = describe(r.weather_code);
        const t = num(r.temp_f), hi = num(r.high_f), lo = num(r.low_f);
        const asOf = new Date(r.fetched_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        return (
          <Tooltip key={r.city}>
            <TooltipTrigger asChild>
              <span className="flex cursor-pointer items-center gap-1" data-testid={`weather-${SHORT[r.city] ?? r.city}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-medium text-foreground">{SHORT[r.city] ?? r.city}</span>
                {t != null && <span>{t}°F</span>}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              <p className="font-medium">{r.city}{text ? ` · ${text}` : ""}</p>
              {t != null && <p>{t}°F / {toC(t)}°C{hi != null && lo != null ? ` · high ${hi}° · low ${lo}°` : ""}</p>}
              <p className="text-muted-foreground">Checked {asOf} · click for the Reunion Weather chart</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
    </a>
  );
}
