// Isolated QA: no database hook, no network writes, no real attendee data.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import EntryForm from "../client/src/components/entry-form";
import { TooltipProvider } from "../client/src/components/ui/tooltip";
import { Toaster } from "../client/src/components/ui/toaster";
import { BASE_ACTIVITIES, initSlots, applySuggestedEvents, SUGGESTED_MIEVENTO_IDS, type Person } from "../client/src/lib/reunion";
const mode = new URLSearchParams(location.search).get("mode");
const legacySlots = applySuggestedEvents(initSlots("2027-01-09", "2027-01-30"), "2027-01-09", "2027-01-30", SUGGESTED_MIEVENTO_IDS);
legacySlots["2027-01-22"].a = { s: "private" };
legacySlots["2027-01-25"].m = { s: "busy", t: "vulcan" };
const legacy: Person = {
  name: "Test Returning", email: "returning@example.com", arrival: "2027-01-09", departure: "2027-01-30",
  slots: legacySlots, interests: [], attending: false,
};
function Harness() {
  const [result, setResult] = useState<Person | null>(null);
  return <TooltipProvider>
    <main className="mx-auto max-w-5xl p-4">
      <EntryForm initial={mode === "legacy" ? legacy : undefined}
        sessionEmail={mode === "legacy" ? legacy.email : null}
        activities={BASE_ACTIVITIES} eventPlans={[]} people={mode === "protected" ? [legacy] : []}
        onSave={async (person) => { setResult(structuredClone(person)); }} onSuggestActivity={async () => {}} isDemo />
      <pre data-testid="saved-payload">{result ? JSON.stringify(result) : "No save"}</pre>
      <Toaster />
    </main>
  </TooltipProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
