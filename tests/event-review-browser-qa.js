// Run in js_repl after qaBrowser/qaContext/qaPage bootstrap.
// QA inventory: initial unchecked suggestions; all/individual/none; fee guard;
// pre-confirm disabled grid; save payload; returning partial data; review/edit;
// range changes; protected profile; desktop/mobile/dark layout and overflow.
var reviewAssert = (await import("node:assert/strict")).default;
var reviewIds = ["coffee-house-19", "chicken-21", "railway-22", "pin-ding-22", "mega-cruise-23"];
var reviewStartNew = async () => {
  await qaPage.goto("http://127.0.0.1:3110");
  await qaPage.getByTestId("input-name").fill("Test New");
  await qaPage.getByTestId("input-email").fill("new@example.com");
  await qaPage.getByTestId("button-confirm-name").click();
  await qaPage.getByTestId("button-confirm-dates").click();
  await qaPage.getByTestId("button-confirm-interests").click();
  await qaPage.getByTestId("optional-event-review").scrollIntoViewIfNeeded();
};
var reviewFinishNew = async () => {
  await qaPage.getByTestId("button-confirm-slots").click();
  await qaPage.getByTestId("button-attending-not-sure").click();
  await qaPage.getByTestId("button-save-availability").click();
  await qaPage.getByTestId("card-confirmation").waitFor();
  return JSON.parse(await qaPage.getByTestId("saved-payload").innerText());
};
var savedReviewIds = (person) => [...new Set(Object.values(person.slots).flatMap(day =>
  Object.values(day).filter(slot => slot.s === "busy" && reviewIds.includes(slot.t)).map(slot => slot.t),
))];
await reviewStartNew();
for (var id of reviewIds) reviewAssert.equal(await qaPage.getByTestId(`review-event-${id}`).isChecked(), false);
reviewAssert.equal(await qaPage.getByTestId("button-confirm-events").isDisabled(), true);
reviewAssert.equal(await qaPage.getByTestId("select-status-2027-01-19-e").isDisabled(), true);
reviewAssert.match(await qaPage.getByTestId("suggestion-2027-01-19-e").innerText(), /Not selected/);
await qaPage.getByTestId("button-select-all-events").click();
for (var id of reviewIds) reviewAssert.equal(await qaPage.getByTestId(`review-event-${id}`).isChecked(), true);
reviewAssert.match(await qaPage.getByTestId("select-status-2027-01-19-e").innerText(), /Available/);
reviewAssert.equal(await qaPage.getByTestId("button-confirm-events").isDisabled(), true);
await qaPage.getByTestId("review-event-mega-cruise-23").uncheck();
await qaPage.getByTestId("checkbox-ticket-costs").check();
reviewAssert.match(await qaPage.getByTestId("button-confirm-events").innerText(), /Confirm 4/);
await qaPage.getByTestId("checkbox-ticket-costs").uncheck();
reviewAssert.equal(await qaPage.getByTestId("button-confirm-events").isDisabled(), true);
await qaPage.getByTestId("checkbox-ticket-costs").check();
await qaPage.getByTestId("button-confirm-events").click();
reviewAssert.equal(await qaPage.getByTestId("select-status-2027-01-19-e").isDisabled(), false);
reviewAssert.match(await qaPage.getByTestId("select-event-2027-01-22-m").innerText(), /Railway/);
reviewAssert.match(await qaPage.getByTestId("select-event-2027-01-22-a").innerText(), /Railway/);
var savedMixed = await reviewFinishNew();
reviewAssert.equal(savedReviewIds(savedMixed).length, 4);
reviewAssert(!savedReviewIds(savedMixed).includes("mega-cruise-23"));
reviewAssert.equal(savedMixed.slots["2027-01-20"].e.t, "yacht-club");
console.log("PASS hybrid all-plus-individual, ticket guard, draft-only until confirmation, correct save payload");

await reviewStartNew();
await qaPage.getByTestId("checkbox-ticket-costs").check();
reviewAssert.equal(await qaPage.getByTestId("button-confirm-events").isDisabled(), true, "empty selection must be deliberate");
await qaPage.getByTestId("button-no-events").click();
await qaPage.getByTestId("button-confirm-events").click();
var savedNone = await reviewFinishNew();
reviewAssert.deepEqual(savedReviewIds(savedNone), []);
console.log("PASS explicit None for now saves no suggested attendance");

await reviewStartNew();
await qaPage.getByTestId("review-event-chicken-21").check();
await qaPage.getByTestId("checkbox-ticket-costs").check();
await qaPage.getByTestId("button-confirm-events").click();
var savedOne = await reviewFinishNew();
reviewAssert.deepEqual(savedReviewIds(savedOne), ["chicken-21"]);
console.log("PASS individual choice saves only selected event");

await qaPage.goto("http://127.0.0.1:3110/?mode=legacy");
await qaPage.getByTestId("legacy-event-notice").waitFor();
for (var id of reviewIds) reviewAssert.equal(await qaPage.getByTestId(`review-event-${id}`).isChecked(), true);
await qaPage.getByTestId("checkbox-ticket-costs").check();
await qaPage.getByTestId("button-confirm-events").click();
await qaPage.getByTestId("button-save-availability").click();
await qaPage.getByTestId("card-confirmation").waitFor();
var savedLegacy = JSON.parse(await qaPage.getByTestId("saved-payload").innerText());
reviewAssert.equal(savedReviewIds(savedLegacy).length, 5);
reviewAssert.equal(savedLegacy.slots["2027-01-22"].a.s, "private");
reviewAssert.equal(savedLegacy.slots["2027-01-25"].m.t, "vulcan");
await qaPage.getByTestId("button-edit-again").click();
await qaPage.getByTestId("button-review-events").click();
await qaPage.getByTestId("review-event-chicken-21").uncheck();
reviewAssert.equal(JSON.parse(await qaPage.getByTestId("saved-payload").innerText()).slots["2027-01-21"].e.t, "chicken-21");
await qaPage.getByTestId("checkbox-ticket-costs").check();
await qaPage.getByTestId("button-confirm-events").click();
await qaPage.getByTestId("button-save-availability").click();
await qaPage.getByTestId("card-confirmation").waitFor();
var editedLegacy = JSON.parse(await qaPage.getByTestId("saved-payload").innerText());
reviewAssert.equal(editedLegacy.slots["2027-01-21"].e.s, "ok");
reviewAssert.equal(editedLegacy.slots["2027-01-22"].a.s, "private");
console.log("PASS legacy selections retained, no pre-save mutation, partial-day private answer preserved, edit and unselect");

await qaPage.goto("http://127.0.0.1:3110/?mode=protected");
await qaPage.getByTestId("input-email").fill("returning@example.com");
await qaPage.getByTestId("input-name").fill("Test Returning");
await qaPage.getByTestId("text-protected-entry").waitFor();
await qaPage.getByTestId("checkbox-ticket-costs").check();
await qaPage.getByTestId("button-confirm-events").click();
await qaPage.getByTestId("button-save-availability").click();
reviewAssert.match(await qaPage.getByTestId("text-validation-error").innerText(), /protected/);
reviewAssert.equal(await qaPage.getByTestId("saved-payload").innerText(), "No save");
console.log("PASS protected profiles cannot be changed");
reviewAssert.deepEqual(qaErrors, []);
