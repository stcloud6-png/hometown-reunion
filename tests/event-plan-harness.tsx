// Isolated browser regression harness. All REST traffic targets a dummy host
// and is fulfilled by Playwright; never point this harness at production.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import Dashboard from "../client/src/components/dashboard";
import SettingsPopover from "../client/src/components/settings-popover";
import { TooltipProvider } from "../client/src/components/ui/tooltip";
import { useReunionData } from "../client/src/lib/use-reunion-data";
import { DEMO_PEOPLE, storage, STORAGE_KEYS } from "../client/src/lib/reunion";

const role = new URLSearchParams(location.search).get("role");
if (role === "organizer-auth") {
  storage.set(STORAGE_KEYS.accessToken, "synthetic-test-token");
  storage.set(STORAGE_KEYS.refreshToken, "synthetic-test-refresh");
  storage.set(STORAGE_KEYS.email, "organizer@example.com");
}
function Harness() {
  // Exercise the real HTTP save path with entirely stubbed REST routes.
  const data = useReunionData({ stub: false });
  const [unlocked, setUnlocked] = useState(false);
  return <TooltipProvider>
    <header className="p-4"><SettingsPopover showPills={false} onShowPillsChange={() => {}} unlocked={unlocked} onUnlockedChange={setUnlocked} /></header>
    <main className="mx-auto max-w-5xl px-4">
      {data.loading ? <p>Loading test fixtures</p> : <Dashboard
        people={DEMO_PEOPLE} activities={data.activities} clusterResources={data.clusterResources}
        clusterLeads={data.clusterLeads} eventPlans={data.eventPlans} isDemo={true}
        sessionEmail={data.sessionEmail} myPerson={null}
        myIdentity={role === "organizer" ? { name: "Test Organizer", email: "organizer@example.com" } : null}
        showPills={false} unlocked={unlocked} curtainOpen={false} onCurtainOpenChange={() => {}}
        onSuggestResource={data.suggestResource} onVolunteerLead={data.volunteerLead}
        onSaveEventPlan={data.saveEventPlan} onBackToAvailability={() => {}}
      />}
    </main>
  </TooltipProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
