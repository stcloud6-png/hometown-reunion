import assert from "node:assert/strict";
import { addPlacesToChart, DEMO_PLACES, monthlyRows, placeKey, placeWindows, visiblePlaces, windowsFor, type Season } from "../client/src/lib/weather-places";
import { buildChart, toDay } from "../client/src/lib/weather-estimate";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`ok ${name}`); };
const all = new Set<Season>(["spring", "summer", "fall"]);
const P = (code: string) => DEMO_PLACES.find((p) => p.code === code)!;

t("groups match the owner's buttons", () => {
  const g = (k: number) => DEMO_PLACES.filter((p) => p.geo_group === k).map((p) => p.code).join(",");
  assert.equal(g(1), "B,E"); assert.equal(g(2), "I,Al,Se,Po1,Po2"); assert.equal(g(3), "O,N1,N2"); assert.equal(g(4), "Qu,Pu,Sa,Bu");
});
t("periods match the owner's list", () => {
  const s = (id: Season) => DEMO_PLACES.filter((p) => p.seasons.includes(id)).map((p) => p.code).sort().join(",");
  assert.equal(s("spring"), "B,E,O,Po1,Se");
  assert.equal(s("summer"), "Bu,I,N1,Po2,Pu,Qu,Sa");
  assert.equal(s("fall"), "Al,N2,O,Po2");
});
t("O shows in two separate windows; Po2 summer+fall merge into one", () => {
  assert.equal(windowsFor(P("O"), all).length, 2);
  const po2 = windowsFor(P("Po2"), all);
  assert.equal(po2.length, 1);
  assert.equal(po2[0][0], toDay("2027-05-01")); assert.equal(po2[0][1], toDay("2027-11-30"));
});
t("owner's months (22:10 ET)", () => {
  const w = (code: string) => placeWindows(P(code)).map(([a, b]) => `${new Date(a).toISOString().slice(5, 10)}..${new Date(b).toISOString().slice(5, 10)}`).join(" ");
  assert.equal(w("I"), "06-01..09-30");
  for (const c of ["Se", "Po1", "Bu", "Qu"]) assert.equal(w(c), "01-01..12-31", c);
  assert.equal(w("Pu"), "01-01..05-31 09-01..12-31");
  assert.equal(w("Sa"), "02-01..05-31 09-01..12-01");
  assert.equal(w("Al"), "02-01..06-30 09-01..11-30");
  assert.equal(w("B"), "02-01..04-30"); // unchanged: its period
});
t("a place shows when any of its months are in a selected period", () => {
  const v = visiblePlaces(DEMO_PLACES, new Set([1, 2, 3, 4]), new Set<Season>(["spring"]));
  assert.deepEqual(v.map((x) => x.place.code).sort(), ["Al", "B", "Bu", "E", "O", "Po1", "Pu", "Qu", "Sa", "Se"]);
  const summerOnly = visiblePlaces(DEMO_PLACES, new Set([2]), new Set<Season>(["summer"])).map((x) => x.place.code);
  assert.ok(summerOnly.includes("I") && !summerOnly.includes("B"));
});
t("Sa's Dec 1 end doesn't add a December column", () => {
  const sa = monthlyRows(visiblePlaces(DEMO_PLACES, new Set([4]), all)).find((r) => r.code === "Sa")!;
  assert.deepEqual(sa.months.map((m) => m.label), ["Feb", "Mar", "Apr", "May", "Sep", "Oct", "Nov"]);
});
t("no location buttons → chart unchanged", () => {
  const c = buildChart([]);
  assert.equal(addPlacesToChart(c.points, visiblePlaces(DEMO_PLACES, new Set(), all)), c.points);
});
t("place values only inside windows, unbroken within, broken between", () => {
  const c = buildChart([]);
  const v = visiblePlaces(DEMO_PLACES, new Set([3]), all);
  const pts = addPlacesToChart(c.points, v) as unknown as Record<string, number>[];
  const k = placeKey("O", "hi");
  const inWin = (x: number) => (x >= toDay("2027-02-01") && x <= toDay("2027-04-30")) || (x >= toDay("2027-09-01") && x <= toDay("2027-11-30"));
  for (const r of pts) assert.equal(r[k] != null, inWin(r.t), `row ${new Date(r.t).toISOString()}`);
  assert.ok(pts.some((r) => r.t === toDay("2027-02-01")) && pts.some((r) => r.t === toDay("2027-11-30")));
  // Orlando estimate now runs to the end of December 2027.
  assert.ok(pts.find((r) => r.t === toDay("2027-12-31"))?.oHighEst != null);
});
t("monthly table lists each selected month once", () => {
  const rows = monthlyRows(visiblePlaces(DEMO_PLACES, new Set([2]), all));
  const po2 = rows.find((r) => r.code === "Po2")!;
  assert.deepEqual(po2.months.map((m) => m.label), ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]);
});
console.log(`weather-places: ${n} passed`);
