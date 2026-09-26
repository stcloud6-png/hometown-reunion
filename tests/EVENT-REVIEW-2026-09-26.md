# Optional event review checkpoint

Date: September 26, 2026. Base source checkpoint: `58c532f`.

## Behavior

- The five formerly preselected MiEvento events are suggestions, not initial attendance.
- Users may check individual events, select the displayed group, or deliberately choose None for now.
- A separate ticket-cost acknowledgment and confirmation are required before editing the grid or saving when suggested events fall within the trip.
- Checkbox changes are draft-only. Confirmation applies those choices to the draft slots. Saving the entire form records them through the existing persistence path.
- Existing attendance is not migrated, cleared, or reclassified automatically. Returning users see their existing selections with a warning that they may reflect old defaults.
- Previously saved partial-day choices and unrelated slots survive reconfirmation. Explicitly removing an event clears only slots tagged with that event.
- Date changes reopen review. Suggestions outside the travel dates are not applied.
- Yacht Club's existing locked evening is unchanged. Other existing non-MiEvento defaults are unchanged.
- Volcán and Boquete labels are corrected. Existing machine IDs `vulcan` and `boquette` are retained intentionally for reference compatibility; these are not display names.
- Volcán/Boquete now also support January 25–30. El Valle/Coronado now also support January 9–17, including the evening of January 17. Previously available dates are retained.

## Data and pricing safety

No live database writes, schema migrations, attendee cleanup, emails, or ticket purchases were performed.
Read-only checks found no matching misspelled display text in activity labels, resource labels, or plan venues/notes. One saved profile references each legacy place ID, which is why the identifiers remain stable.

The [MiEvento CZR2027 page](https://www.mieventos.com/event-multiple-detail/czr-2027) did not provide verifiable prices for all five suggested events in the retrieved content. No numeric prices or totals were invented. The UI directs attendees to MiEvento to check current prices, fees, availability and buy/reserve tickets.
Attendance selection is not a purchase or reservation. Ticket status remains separately self-reported.

## Verification

Run from the repository root:

```sh
npx esbuild tests/event-review.test.ts --bundle --platform=node --format=esm '--define:import.meta.env={}' --outfile=/tmp/reunion-review-test.mjs
node /tmp/reunion-review-test.mjs
npx tsc --noEmit -p .
VITE_STUB_DATA=true npm run build
node tests/build-review-qa.mjs
```

Browser QA uses `tests/event-review-harness.tsx`, which imports the real EntryForm but has no database hook. Its save callback captures a synthetic payload in memory. Serve `/tmp/reunion-review-qa` on port 3110 and run `tests/event-review-browser-qa.js` in the Playwright REPL after creating `qaBrowser`, `qaContext` and `qaPage`. Block external network requests.

Passed checks: names and all requested date/period boundaries; no initial five-event attendance; hybrid all-plus-individual selection; fee acknowledgment; explicit none; exact saved payload; returning-profile partial-day preservation; edit/remove without pre-save mutation; protected-profile save rejection; date-change re-review; January 25 place picker; January 17 evening place picker.

Visual checks: 1280px desktop, 375px mobile, light/dark event review, checked and unchecked states, disabled and unlocked grids. No page-level horizontal overflow observed in the tested mobile states. Existing compact mobile event labels are intentionally truncated; the existing mobile picker exposes full names.

## Restore and deployment

This is a source-only, no-schema change. Before production deployment, build with `VITE_STUB_DATA=false`; preview builds use `true` and must not be sent to production.
To restore the prior behavior, revert the optional-event-review commit, build with the appropriate mode, and redeploy. No database restore is needed because existing records were not changed.

Keep source merges separate from deployment approval. Do not merge the pending yearbook/event-plan branches as part of this change without explicit approval.
