import assert from "node:assert/strict";
import {
  buildClassEvents, checkChoice, toggleChoice, applyAnswersToSlots, answersAfterCalendarEdit,
  applyYachtToSlots, openSlots, periodsForTimeText, calendarIdForTicket, whoIsGoing, whoPicksPills, NAPOLI_KEY, YACHT_KEY,
  type CheckContext,
} from "../client/src/lib/class-events";
import { findRepeat, words, type DedupeTarget } from "../client/src/lib/pill-dedupe";
import { initSlots, labelForTag, BASE_ACTIVITIES } from "../client/src/lib/reunion";
import type { TicketWatchRow } from "../client/src/lib/ticket-watch";

// Live MiEvento snapshot as of 2026-11-19.
const LIVE: [string, string, string, string, number | null, number][] = [
  ["2027-01-17", "Southbound Panama Canal Partial Transit", "(Sunday) Southbound Partial Transit 9am-5pm", "available", 10, 145],
  ["2027-01-18", "Gold Coast Bus Tour (Atlantic Side)", "8am-5pm", "available", 7, 90],
  ["2027-01-18", "Move & Mingle Up Ancon Hill", "8:30am-11am", "available", 1, 0],
  ["2027-01-18", "PANAMA BAY - Al Sprague Chichipati Fishing Challenge", "6am-4pm", "available", 10, 265],
  ["2027-01-19", "Carimañola Cooking Class", "11:30am - 2:30pm", "sold_out", null, 40],
  ["2027-01-19", "El Prado Walking Tour", "8:30am-10:30am", "available", 10, 25],
  ["2027-01-19", "Family Day Gatun Lake & Chagres River Cruise", "8am-12pm", "available", 3, 50],
  ["2027-01-19", "GATUN LAKE - Al Sprague Chichipati Fishing Challenge", "6am-2:30pm", "available", 10, 145],
  ["2027-01-19", "Reprosa Workshop Bus Tour", "12:30pm-3:30pm", "sold_out", null, 25],
  ["2027-01-20", "Al Sprague Art Bus Tour", "10:30am-3pm", "available", 10, 45],
  ["2027-01-20", "Chiva Parrandera", "7pm-10pm", "available", 10, 40],
  ["2027-01-20", "El Prado Walking Tour", "8:30am-10:30am", "available", 10, 25],
  ["2027-01-20", "Summit Gardens Adventure Bus Tour", "8am-1:30pm", "sold_out", null, 35],
  ["2027-01-20", "VIP Bay Cruise", "7pm-10pm", "sold_out", null, 75],
  ["2027-01-20", "VIP Miraflores Locks Bus Tour", "11am-4pm", "available", 10, 80],
  ["2027-01-21", "CZR Ray² Golf Invitational Tournament", "8am-2pm", "available", 20, 125],
  ["2027-01-21", "Midnite Chicken Coop", "8pm-12am", "available", 10, 15],
  ["2027-01-21", "Museums Bus Tour: BioMuseum, Panama Canal & Mola Museum", "12:30pm-5pm", "available", 10, 70],
  ["2027-01-21", "Reprosa Workshop Bus Tour", "8:30am-11:30am", "sold_out", null, 25],
  ["2027-01-21", "VIP Miraflores Locks Bus Tour", "12:30-5pm", "sold_out", null, 80],
  ["2027-01-22", "CZR PÍN DÍNG", "8pm-1am", "available", 30, 60],
  ["2027-01-22", "Southbound Panama Canal Partial Transit", "9am-5pm", "available", 10, 145],
  ["2027-01-22", "Panama Canal Railway Experience - DOME Car", "9am", "sold_out", null, 70],
  ["2027-01-22", "Panama Canal Railway Experience (Regular Car)", "9am", "available", 10, 50],
  ["2027-01-23", "CZR Jamboree", "10am-6pm", "available", 20, 40],
  ["2027-01-23", "Mega Bay Cruise", "7:30pm-11:30pm", "available", 10, 45],
  ["2027-01-23", "Move & Mingle Down The Causeway", "8:30am-9:30am", "available", 1, 0],
  ["2027-01-24", "Taboga Island Cruise", "10am-4pm", "available", 6, 90],
];
const tickets: TicketWatchRow[] = LIVE.map(([event_date, name, time_text, status, max_qty, price]) => ({
  watch_key: `${event_date}|${name}`, event_date, name, time_text, status, max_qty, price,
  status_label: null, prev_status: null, prev_max_qty: null, sold_out_since: null, last_seen: "2026-11-19T11:00:00Z",
}));

// --- catalog --------------------------------------------------------------
for (const t of tickets) assert.ok(calendarIdForTicket(t), `unmapped MiEvento listing: ${t.event_date} ${t.name}`);
const cat = buildClassEvents(tickets);
assert.equal(cat.length, 29, "28 MiEvento rows + Napoli");
assert.equal(cat[cat.length - 1].key, NAPOLI_KEY, "Napoli is the last row");
assert.ok(cat[cat.length - 1].planOnly);
for (const e of cat) assert.notEqual(labelForTag(e.key, []), e.key, `calendar has no label for ${e.key}`);
const byKey = (k: string) => cat.find((e) => e.key === k)!;
assert.ok(byKey("summit-20").soldOut);
assert.equal(byKey("move-ancon-18").lowStock, null, "free events capped at 1 are not 'only 1 left'");
assert.equal(byKey("gatun-cruise-19").lowStock, 3);
// Dates ascend, then time of day.
for (let i = 1; i < cat.length - 1; i++) assert.ok(cat[i - 1].date <= cat[i].date);
assert.deepEqual(cat.filter((e) => e.date === "2027-01-19").map((e) => e.key).slice(0, 2), ["gatun-fishing-19", "gatun-cruise-19"]);

// --- timeslot rules (plan section 4) -----------------------------------------
const expect: Record<string, string> = {
  "transit-17": "ma", "gold-coast-18": "ma", "chichipati-18": "ma", "move-ancon-18": "m",
  "gatun-cruise-19": "ma", "gatun-fishing-19": "ma", "prado-19": "m", "carimanola-19": "a", "reprosa-19": "a",
  "prado-20": "m", "summit-20": "ma", "sprague-20": "ma", "miraflores-20": "ma", "chiva-20": "e", "vip-bay-cruise-20": "e",
  "golf-21": "ma", "reprosa-21": "m", "museums-21": "a", "locks-21": "a", "chicken-21": "e",
  "transit-22": "ma", "railway-22": "ma", "dome-car-22": "ma", "pin-ding-22": "e",
  "jamboree-23": "ma", "move-causeway-23": "m", "mega-cruise-23": "e", "taboga-24": "mae", [NAPOLI_KEY]: "a",
};
for (const [k, v] of Object.entries(expect)) assert.equal(byKey(k).periods.join(""), v, `slots for ${k}`);
assert.deepEqual(periodsForTimeText("8:30am-9:30am"), ["m"], "at least one slot");
assert.deepEqual(periodsForTimeText("10am-6pm"), ["m", "a"], "an hour into the evening doesn't block it");

// --- the two columns ----------------------------------------------------------
const base: CheckContext = { answers: {}, yacht: "planning", catalog: cat, arrival: "2027-01-15", departure: "2027-01-25" };
// Sold out: can't plan, can say you have a ticket.
assert.equal(checkChoice(byKey("summit-20"), "planning", base).allowed, false);
assert.match(checkChoice(byKey("summit-20"), "planning", base).reason!, /Sold out/);
assert.equal(checkChoice(byKey("summit-20"), "purchased", { ...base, yacht: "not_attending" }).allowed, true);
// Napoli: plan only.
assert.equal(checkChoice(byKey(NAPOLI_KEY), "purchased", base).allowed, false);
assert.equal(checkChoice(byKey(NAPOLI_KEY), "planning", base).allowed, true);
// Yacht vs Chiva (both Wed evening).
const chiva = checkChoice(byKey("chiva-20"), "planning", base);
assert.equal(chiva.allowed, false);
assert.match(chiva.reason!, /Yacht Club/);
assert.equal(checkChoice(byKey("chiva-20"), "planning", { ...base, yacht: "not_attending" }).allowed, true);
// Napoli vs Sprague (Wed afternoon) — both directions.
let t = toggleChoice(byKey(NAPOLI_KEY), "planning", base);
assert.equal(t.result.allowed, true);
const withNapoli = { ...base, answers: t.answers };
assert.match(checkChoice(byKey("sprague-20"), "planning", withNapoli).reason!, /Napoli/);
assert.equal(checkChoice(byKey("prado-20"), "planning", withNapoli).allowed, true, "El Prado is morning only");
// Two bought tickets in the same slot: allowed with a warning.
const bought = { ...base, answers: { "railway-22": "purchased" as const } };
const both = checkChoice(byKey("transit-22"), "purchased", bought);
assert.equal(both.allowed, true);
assert.match(both.warning!, /Railway/);
assert.equal(checkChoice(byKey("transit-22"), "planning", bought).allowed, false);
// Switching columns on the same row isn't a clash with itself; ticking again unticks.
t = toggleChoice(byKey("golf-21"), "planning", base);
t = toggleChoice(byKey("golf-21"), "purchased", { ...base, answers: t.answers });
assert.equal(t.answers["golf-21"], "purchased");
t = toggleChoice(byKey("golf-21"), "purchased", { ...base, answers: t.answers });
assert.equal(t.answers["golf-21"], undefined);
// Out of their dates.
assert.match(checkChoice(byKey("taboga-24"), "planning", { ...base, departure: "2027-01-23" }).reason!, /not in Panama/);

// --- calendar sync ---------------------------------------------------------------
const arrival = "2027-01-15", departure = "2027-01-25";
let slots = applyYachtToSlots(initSlots(arrival, departure), "planning");
assert.equal(slots["2027-01-20"].e?.t, YACHT_KEY);
slots = applyAnswersToSlots(slots, { "golf-21": "planning", [NAPOLI_KEY]: "planning" }, cat, arrival, departure);
assert.equal(slots["2027-01-21"].m?.t, "golf-21");
assert.equal(slots["2027-01-21"].a?.t, "golf-21");
assert.equal(slots["2027-01-21"].e?.s, "ok");
assert.equal(slots["2027-01-20"].a?.t, NAPOLI_KEY);
// Untick golf -> its slots go back to Available.
slots = applyAnswersToSlots(slots, { [NAPOLI_KEY]: "planning" }, cat, arrival, departure);
assert.equal(slots["2027-01-21"].m?.s, "ok");
// Calendar edit that removes Napoli unticks it in the grid.
slots["2027-01-20"].a = { s: "private" };
const after = answersAfterCalendarEdit(slots, { [NAPOLI_KEY]: "planning" }, cat);
assert.deepEqual(after.answers, {});
assert.equal(after.dropped[0].key, NAPOLI_KEY);
// Yacht "can't make it" frees Wed evening.
slots = applyYachtToSlots(slots, "not_attending");
assert.equal(slots["2027-01-20"].e?.s, "ok");
// Open slots for the pill picker: Available + Maybe only, inside their dates.
slots["2027-01-16"].m = { s: "maybe" };
slots["2027-01-16"].a = { s: "private" };
const open = openSlots(slots, arrival, departure);
assert.ok(open.includes("2027-01-16:m"));
assert.ok(!open.includes("2027-01-16:a"));
assert.ok(!open.some((id) => id < arrival));

// --- repeat pills --------------------------------------------------------------------
const REMOVED = ["railway-87", "pin-ding", "golf", "bay-cruise-87", "chicken-coup"];
const targets: DedupeTarget[] = [
  ...BASE_ACTIVITIES.filter((a) => !REMOVED.includes(a.id) && a.id !== "napoli").map((a) => ({ id: a.id, label: a.label, kind: "pill" as const })),
  ...cat.map((e) => ({ id: e.key, label: e.name, kind: "event" as const })),
  { id: YACHT_KEY, label: "Yacht Club Dinner Dance", kind: "event" },
];
const rejects: [string, string][] = [
  ["Golf scramble", "golf-21"],
  ["Pingding party", "pin-ding-22"],
  ["Ping Ding", "pin-ding-22"],
  ["Karoke", "karaoke"],
  ["Chivas", "chiva-20"],
  ["Railroad ride", "dome-car-22"],
  ["Bay cruise for 87", "mega-cruise-23"],
  ["Chicken wings at the coop", "chicken-21"],
  ["Napoli dinner", NAPOLI_KEY],
  ["Beach volleyball", "coronado"],
  ["Rooftop drinks", "rooftop-dinner-casco"],
  ["Cáscó walk", "rooftop-dinner-casco"],
  ["Scuba", "scuba-diving"],
  ["Yacht party", YACHT_KEY],
  ["Taboga swim", "taboga-24"],
];
for (const [s, id] of rejects) {
  const hit = findRepeat(s, targets);
  assert.ok(hit, `should reject "${s}"`);
  if (id !== "dome-car-22" && id !== "mega-cruise-23") assert.equal(hit!.target.id, id, `"${s}" should point at ${id}, got ${hit!.target.id}`);
}
const accepts = ["Salsa lessons", "Sunset sail", "Poker", "Zip lining", "Tango", "Kayaking", "Wine tasting"];
for (const s of accepts) assert.equal(findRepeat(s, targets), null, `should accept "${s}" (hit: ${JSON.stringify(findRepeat(s, targets))})`);
assert.deepEqual(words("Exclusive Bay Cruise for 87"), ["bay", "cruise"]);

// Who's going / who picked a pill: names only, self and test entries left out.
{
  const ppl = [
    { name: "Ann", event_answers: { "golf-21": "purchased" as const }, yacht_status: "paid", interests: ["karaoke", "napoli"], pill_slots: { karaoke: ["2027-01-21:evening"], bowling: ["2027-01-22:evening"] } },
    { name: "Bob", event_answers: { "golf-21": "planning" as const, [NAPOLI_KEY]: "purchased" as const }, yacht_status: "planning", interests: ["karaoke"], pill_slots: { karaoke: ["2027-01-21:evening", "2027-01-22:afternoon"] } },
    { name: "Me", event_answers: { "golf-21": "purchased" as const }, yacht_status: "paid", interests: ["karaoke"], pill_slots: { karaoke: ["2027-01-21:evening"] } },
    { name: "Tester", is_test: true, event_answers: { "golf-21": "purchased" as const }, yacht_status: "paid", interests: ["karaoke"] },
    { name: "Cy", yacht_status: "not_attending", interests: [] },
  ];
  const who = whoIsGoing(ppl, "me");
  assert.deepEqual(who["golf-21"], { purchased: ["Ann"], planning: ["Bob"] });
  assert.deepEqual(who[YACHT_KEY], { purchased: ["Ann"], planning: ["Bob"] });
  assert.deepEqual(who[NAPOLI_KEY], { purchased: ["Bob"], planning: ["Ann"] }); // Ann's Napoli pill counts as planning
  const pills = whoPicksPills(ppl, "Me");
  assert.deepEqual(pills.byPill.karaoke, ["Ann", "Bob"]);
  assert.deepEqual(pills.bySlot.karaoke["2027-01-21:evening"], ["Ann", "Bob"]);
  assert.equal(pills.bySlot.bowling, undefined); // slot picks for a pill they no longer have are ignored
}

console.log("class-events + pill-dedupe tests passed");
