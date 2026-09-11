import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import EntryForm from "@/components/entry-form";
import Dashboard from "@/components/dashboard";
import { useReunionData } from "@/lib/use-reunion-data";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { formatDateRange, START_DATE, END_DATE } from "@/lib/reunion";

const STUB = import.meta.env.VITE_STUB_DATA === "true";

export default function Home() {
  const [tab, setTab] = useState<"entry" | "dashboard">("entry");
  const { dark, toggle } = useDarkMode();
  const data = useReunionData({ stub: STUB });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <img src="/reunion-logo.jpg" alt="CZR BHS87 Reunion" className="h-10 w-10 rounded-full object-cover" />
            <div>
              <p className="text-sm font-semibold leading-tight">CZR BHS87 Reunion</p>
              <p className="text-xs text-muted-foreground">{formatDateRange(START_DATE, END_DATE)}, 2027</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Button variant={tab === "entry" ? "default" : "ghost"} size="sm" onClick={() => setTab("entry")} data-testid="nav-entry">
              My availability
            </Button>
            <Button variant={tab === "dashboard" ? "default" : "ghost"} size="sm" onClick={() => setTab("dashboard")} data-testid="nav-dashboard">
              Group dashboard
            </Button>
            <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={toggle} data-testid="button-dark-mode">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {tab === "entry" ? (
          <>
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-semibold">Mark once, meet more.</h1>
              <p className="mt-2 text-muted-foreground">
                Tell us when you're in town and what you're up for — the group dashboard turns everyone's
                answers into the best windows to get together.
              </p>
            </div>
            <EntryForm
              activities={data.activities}
              eventPlans={data.eventPlans}
              onSave={data.savePerson}
              onSuggestActivity={data.suggestActivity}
            />
          </>
        ) : (
          <Dashboard
            people={data.people}
            activities={data.activities}
            clusterResources={data.clusterResources}
            clusterLeads={data.clusterLeads}
            eventPlans={data.eventPlans}
            isDemo={data.isDemo}
            sessionEmail={data.sessionEmail}
            onSuggestResource={data.suggestResource}
            onVolunteerLead={data.volunteerLead}
            onSaveEventPlan={data.saveEventPlan}
          />
        )}
      </main>
    </div>
  );
}
