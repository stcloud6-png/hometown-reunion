import assert from "node:assert/strict";
import { addPlacesToChart, addTrailToChart, DEMO_PLACES, monthlyRows, placeKey, placeWindows, trailKey, trailRows, TRAILS, visiblePlaces, windowsFor, type Season } from "../client/src/lib/weather-places";
import { buildChart, toDay } from "../client/src/lib/weather-estimate";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`ok ${name}`); };
const all = new Set<Season>(["spring", "summer", "fall"]);
const P = (code: string) => DEMO_PLACES.find((p) => p.code === code)!;
const inGroups = (...g: number[]) => new Set(DEMO_PLACES.filter((p) => g.includes(p.geo_group)).map((p) => p.code));

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
t("owner's months (22:10 + 22:36 ET)", () => {
  const w = (code: string) => placeWindows(P(code)).map(([a, b]) => `${new Date(a).toISOString().slice(5, 10)}..${new Date(b).toISOString().slice(5, 10)}`).join(" ");
  assert.equal(w("I"), "06-01..09-30");
  for (const c of ["Po1", "Qu"]) assert.equal(w(c), "01-01..12-31", c);
  assert.equal(w("Se"), "01-01..05-14 10-02..12-31");
  assert.equal(w("Bu"), "03-15..06-19 08-25..11-07");
  assert.equal(w("O"), "02-01..07-01 09-01..10-27");
  assert.equal(w("N1"), "05-21..09-30");
  assert.equal(w("Pu"), "03-15..05-20 10-01..11-07");
  assert.equal(w("Sa"), "03-15..06-01 09-01..11-07");
  assert.equal(w("Al"), "02-01..05-14 09-02..11-30");
  assert.equal(w("B"), "02-01..04-30"); // unchanged: its period
});
t("a place shows when any of its months are in a selected period", () => {
  const v = visiblePlaces(DEMO_PLACES, inGroups(1, 2, 3, 4), new Set<Season>(["spring"]));
  assert.deepEqual(v.map((x) => x.place.code).sort(), ["Al", "B", "Bu", "E", "O", "Po1", "Pu", "Qu", "Sa", "Se"]);
  const summerOnly = visiblePlaces(DEMO_PLACES, inGroups(2), new Set<Season>(["summer"])).map((x) => x.place.code);
  assert.ok(summerOnly.includes("I") && !summerOnly.includes("B"));
});
t("Sa's 1 Jun end doesn't add a June column", () => {
  const sa = monthlyRows(visiblePlaces(DEMO_PLACES, inGroups(4), all)).find((r) => r.code === "Sa")!;
  assert.deepEqual(sa.months.map((m) => m.label), ["Mar", "Apr", "May", "Sep", "Oct", "Nov"]);
});
t("no location buttons → chart unchanged", () => {
  const c = buildChart([]);
  assert.equal(addPlacesToChart(c.points, visiblePlaces(DEMO_PLACES, new Set<string>(), all)), c.points);
});
t("place values only inside windows, unbroken within, broken between", () => {
  const c = buildChart([]);
  const v = visiblePlaces(DEMO_PLACES, inGroups(3), all);
  const pts = addPlacesToChart(c.points, v) as unknown as Record<string, number>[];
  const k = placeKey("O", "hi");
  const inWin = (x: number) => (x >= toDay("2027-02-01") && x <= toDay("2027-07-01")) || (x >= toDay("2027-09-01") && x <= toDay("2027-10-27"));
  for (const r of pts) assert.equal(r[k] != null, inWin(r.t), `row ${new Date(r.t).toISOString()}`);
  assert.ok(pts.some((r) => r.t === toDay("2027-02-01")) && pts.some((r) => r.t === toDay("2027-11-30")));
  // Orlando estimate now runs to the end of December 2027.
  assert.ok(pts.find((r) => r.t === toDay("2027-12-31"))?.oHighEst != null);
});
t("monthly table lists each selected month once", () => {
  const rows = monthlyRows(visiblePlaces(DEMO_PLACES, inGroups(2), all));
  const po2 = rows.find((r) => r.code === "Po2")!;
  assert.deepEqual(po2.months.map((m) => m.label), ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]);
});
t("checking one box shows just that location", () => {
  const v = visiblePlaces(DEMO_PLACES, new Set(["Po2"]), all);
  assert.deepEqual(v.map((x) => x.place.code), ["Po2"]);
});
t("trail A matches the owner's stops", () => {
  const a = TRAILS.find((t) => t.id === "A")!;
  assert.deepEqual(a.stops.map((s) => `${s.code} ${s.from}-${s.to}`), [
    "Orlando 01-01-02-01", "Se 02-01-05-01", "I 05-01-08-01", "Po1 08-01-11-01", "Po2 08-01-11-01", "Orlando 11-01-12-31",
  ]);
  assert.deepEqual(TRAILS.map((t) => t.id), ["A", "B", "C", "D", "E", "F", "G", "H"]);
});
t("trail lines only over each stop's days; reunion cities use city normals", () => {
  const city = { Orlando: [[72, 50], [75, 53], [79, 56], [84, 61], [88, 66], [91, 72], [92, 74], [92, 74], [90, 72], [85, 66], [78, 58], [74, 53]] as [number, number][], Panama: Array(12).fill([88, 76]) as [number, number][] };
  for (const tr of TRAILS) {
    const pts = addTrailToChart(buildChart([]).points, tr, DEMO_PLACES, city) as unknown as Record<string, number>[];
    tr.stops.forEach((s, i) => {
      const a = toDay(`2027-${s.from}`), b = toDay(`2027-${s.to}`);
      for (const r of pts) assert.equal(r[trailKey(i, "hi")] != null, r.t >= a && r.t <= b, `${tr.id} stop ${i}`);
    });
    for (const r of trailRows(tr, DEMO_PLACES, city)) assert.ok(r.high != null && r.low != null, `${tr.id} ${r.code}`);
  }
});
t("every trail stop is a known code or a reunion city", () => {
  const known = new Set([...DEMO_PLACES.map((p) => p.code), "Orlando", "Panama"]);
  for (const tr of TRAILS) for (const s of tr.stops) assert.ok(known.has(s.code), `${tr.id}: ${s.code}`);
});
t("trail + locations together: no line is broken mid-window", () => {
  const city = { Orlando: Array(12).fill([80, 60]) as [number, number][], Panama: Array(12).fill([88, 76]) as [number, number][] };
  const tr = TRAILS.find((t) => t.id === "A")!;
  const v = visiblePlaces(DEMO_PLACES, new Set(["Se"]), all);
  const pts = addTrailToChart(addPlacesToChart(addTrailToChart(buildChart([]).points, tr, DEMO_PLACES, city), v), tr, DEMO_PLACES, city) as unknown as Record<string, number>[];
  const k = placeKey("Se", "hi");
  const runs = pts.filter((r, i) => r[k] != null && pts[i + 1]?.[k] == null).length;
  assert.equal(runs, placeWindows(P("Se")).length);
  tr.stops.forEach((s, i) => assert.equal(pts.filter((r, j) => r[trailKey(i, "hi")] != null && pts[j + 1]?.[trailKey(i, "hi")] == null).length, 1, `stop ${i}`));
});
console.log(`weather-places: ${n} passed`);
