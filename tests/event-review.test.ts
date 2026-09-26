import assert from "node:assert/strict";
import {
  initSlots, applySuggestedEvents, selectedSuggestedEvents, suggestedMieventoEvents,
  SUGGESTED_MIEVENTO_IDS, labelForTag, eventsForDate, PERIODS, statusesForSlot,
} from "../client/src/lib/reunion";

const arrival = "2027-01-09", departure = "2027-01-30";
const fresh = initSlots(arrival, departure);
assert.deepEqual(selectedSuggestedEvents(fresh, arrival, departure), []);
assert.equal(fresh["2027-01-20"].e.t, "yacht-club");
assert.equal(labelForTag("vulcan"), "Volcán");
assert.equal(labelForTag("boquette"), "Boquete");
for (let day = 25; day <= 30; day++) {
  for (const period of PERIODS) {
    const ids = eventsForDate(`2027-01-${day}`, period).map((e) => e.id);
    assert(ids.includes("vulcan") && ids.includes("boquette"));
  }
}
for (let day = 9; day <= 17; day++) {
  const iso = `2027-01-${String(day).padStart(2, "0")}`;
  for (const period of PERIODS) {
    const ids = eventsForDate(iso, period).map((e) => e.id);
    assert(ids.includes("el-valle-26") && ids.includes("coronado-25"));
    assert(statusesForSlot(iso, period).includes("busy"));
  }
}
assert(!eventsForDate("2027-01-24").some((e) => e.id === "vulcan"));
assert(!eventsForDate("2027-01-18").some((e) => e.id === "el-valle-26"));
assert(eventsForDate("2027-01-09").some((e) => e.id === "vulcan"));
assert(eventsForDate("2027-01-30").some((e) => e.id === "el-valle-26"));
assert.equal(suggestedMieventoEvents(arrival, departure).length, 5);
assert.deepEqual(suggestedMieventoEvents("2027-01-25", departure), []);
const all = applySuggestedEvents(fresh, arrival, departure, SUGGESTED_MIEVENTO_IDS);
assert.deepEqual(selectedSuggestedEvents(all, arrival, departure), SUGGESTED_MIEVENTO_IDS);
assert.equal(all["2027-01-22"].m.t, "railway-22");
assert.equal(all["2027-01-22"].a.t, "railway-22");
assert.deepEqual(selectedSuggestedEvents(fresh, arrival, departure), [], "does not mutate original");
const none = applySuggestedEvents(all, arrival, departure, []);
assert.deepEqual(selectedSuggestedEvents(none, arrival, departure), []);
assert.equal(none["2027-01-20"].e.t, "yacht-club");
const partial = structuredClone(all);
partial["2027-01-22"].a = { s: "private" };
partial["2027-01-25"].m = { s: "busy", t: "vulcan" };
assert.deepEqual(applySuggestedEvents(partial, arrival, departure, SUGGESTED_MIEVENTO_IDS), partial,
  "reconfirming legacy data preserves partial slots and unrelated choices");
const one = applySuggestedEvents(fresh, arrival, departure, ["chicken-21"]);
assert.deepEqual(selectedSuggestedEvents(one, arrival, departure), ["chicken-21"]);
const narrowed = initSlots("2027-01-22", "2027-01-22");
const restricted = applySuggestedEvents(narrowed, "2027-01-22", "2027-01-22", SUGGESTED_MIEVENTO_IDS);
assert.deepEqual(Object.keys(restricted), ["2027-01-22"]);
assert.deepEqual(selectedSuggestedEvents(restricted, "2027-01-22", "2027-01-22"), ["railway-22", "pin-ding-22"]);
console.log("PASS: names, all requested date boundaries/periods, empty defaults, individual/all/none confirmation, no mutation, legacy partial preservation, date filtering, Yacht lock");
