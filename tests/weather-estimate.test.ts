import assert from "node:assert/strict";
import { buildChart, normalFor, offsetFor, MILESTONES, toDay, type DailyReading } from "../client/src/lib/weather-estimate";

// The site's real readings 2026-11-19..21 (highs/lows only; public weather data).
const ROWS: DailyReading[] = [
  { city: "Orlando, FL", observed_on: "2026-11-19", high_f: 71.4, low_f: 67.5 },
  { city: "Orlando, FL", observed_on: "2026-11-20", high_f: 72.8, low_f: 68.2 },
  { city: "Orlando, FL", observed_on: "2026-11-21", high_f: 75.7, low_f: 68.9 },
  { city: "Panama City", observed_on: "2026-11-19", high_f: "88.5", low_f: "77.1" },
  { city: "Panama City", observed_on: "2026-11-20", high_f: "88.5", low_f: "78.3" },
  { city: "Panama City", observed_on: "2026-11-21", high_f: "89.1", low_f: "78.3" },
];

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`ok ${name}`); };

t("normal sits on the monthly value on the 15th", () => {
  assert.deepEqual(normalFor("Orlando, FL", "2027-01-15"), { high: 72, low: 50 });
  assert.deepEqual(normalFor("Panama City", "2027-07-15"), { high: 87, low: 77 });
});
t("normal interpolates and wraps the year", () => {
  const d = normalFor("Orlando, FL", "2026-12-31"); // between Dec 15 (74/53) and Jan 15 (72/50)
  assert.ok(d.high < 74 && d.high > 72, `high ${d.high}`);
  assert.ok(d.low < 53 && d.low > 50, `low ${d.low}`);
});
t("3 days → small, shrunk offset", () => {
  const o = offsetFor("Orlando, FL", ROWS);
  assert.equal(o.days, 3);
  assert.ok(Math.abs(o.weight - 3 / 17) < 1e-9);
  assert.ok(Math.abs(o.high) < 2 && Math.abs(o.low) < 2, JSON.stringify(o));
});
t("offset never exceeds ±6°F even with absurd data", () => {
  const hot = Array.from({ length: 60 }, (_, i) => ({ city: "Panama City", observed_on: `2026-${i < 30 ? "11" : "12"}-${String((i % 30) + 1).padStart(2, "0")}`, high_f: 140, low_f: 120 }));
  const o = offsetFor("Panama City", hot);
  assert.equal(o.high, 6); assert.equal(o.low, 6);
});
t("milestones are plausible and the chart has both", () => {
  const c = buildChart(ROWS);
  assert.equal(c.milestones.length, 2);
  const [jan, jul] = c.milestones;
  const o = (m: typeof jan) => m.cities.find((x) => x.city === "Orlando, FL")!;
  const p = (m: typeof jan) => m.cities.find((x) => x.city === "Panama City")!;
  assert.ok(o(jan).high >= 68 && o(jan).high <= 76, `Orlando Jan ${o(jan).high}`);
  assert.ok(o(jul).high >= 89 && o(jul).high <= 95, `Orlando Jul ${o(jul).high}`);
  assert.ok(p(jan).high >= 86 && p(jan).high <= 91, `Panama Jan ${p(jan).high}`);
  assert.ok(p(jul).low >= 75 && p(jul).low <= 79, `Panama Jul low ${p(jul).low}`);
  for (const m of MILESTONES) {
    const pt = c.points.find((x) => x.t === toDay(m.date));
    assert.ok(pt?.oHighEst != null && pt?.pLowEst != null, `estimate point on ${m.date}`);
  }
  assert.equal(c.points.filter((x) => x.oHigh != null).length, 3);
  console.log("   Jan 15:", JSON.stringify(jan.cities), "\n   Jul 4:", JSON.stringify(jul.cities));
});
t("no data → estimate still drawn from normals", () => {
  const c = buildChart([]);
  assert.equal(c.milestones[0].cities[0].high, 72);
});
console.log(`weather-estimate: ${n} passed`);
