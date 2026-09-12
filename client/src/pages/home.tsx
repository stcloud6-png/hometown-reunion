import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Filter, Moon, Sun } from "lucide-react";
import EntryForm from "@/components/entry-form";
import Dashboard from "@/components/dashboard";
import SettingsPopover from "@/components/settings-popover";
import { useReunionData } from "@/lib/use-reunion-data";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { formatDateRange, START_DATE, END_DATE, readMyIdentity, type MyIdentity } from "@/lib/reunion";

const STUB = import.meta.env.VITE_STUB_DATA === "true";

export default function Home() {
  const [tab, setTab] = useState<"entry" | "dashboard">("entry");
  const { dark, toggle } = useDarkMode();
  const data = useReunionData({ stub: STUB });
  const [showPills, setShowPills] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [curtainOpen, setCurtainOpen] = useState(false);
  const [myIdentity, setMyIdentity] = useState<MyIdentity | null>(() => readMyIdentity());

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}reunion-logo.jpg`} alt="CZR BHS87 Reunion" className="h-10 w-10 rounded-full object-cover" />
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
            {tab === "dashboard" && showPills && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCurtainOpen(true)} data-testid="button-curtain-header">
                <Filter className="h-4 w-4" /> Filter
              </Button>
            )}
            <SettingsPopover
              showPills={showPills}
              onShowPillsChange={setShowPills}
              unlocked={unlocked}
              onUnlockedChange={setUnlocked}
              thresholds={data.appSettings}
              onThresholdsChange={data.updateAppSettings}
            />
            <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={toggle} data-testid="button-dark-mode">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {tab === "entry" ? (
          <>
            <div className="mb-10 flex flex-col items-center gap-3 text-center">
              <img src={`${import.meta.env.BASE_URL}reunion-logo.jpg`} alt="CZR BHS87 Reunion" className="h-20 w-20 rounded-full object-cover shadow-md" />
              <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">CZR BHS87</h1>
              <p className="font-serif text-lg italic text-muted-foreground">The Meetup &amp; Planning Organizer</p>
              <p className="max-w-xl text-muted-foreground">
                Panama &middot; January 9&ndash;30, 2027. Tell the group when you're around and what you're up for
                &mdash; we'll find the times that work for the most of us.
              </p>
              <Button asChild size="lg" className="mt-2 rounded-full px-8" data-testid="button-mark-availability">
                <a href="#entry-form">Mark my availability</a>
              </Button>
              <p className="text-xs text-muted-foreground">Takes about two minutes</p>
            </div>
            <div id="entry-form" />
            <EntryForm
              activities={data.activities}
              eventPlans={data.eventPlans}
              onSave={async (person) => {
                await data.savePerson(person);
                setMyIdentity({ name: person.name, email: person.email ?? "" });
              }}
              onSuggestActivity={data.suggestActivity}
              onGoToDashboard={() => setTab("dashboard")}
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
            myPerson={data.myPerson(data.sessionEmail)}
            myIdentity={myIdentity}
            showPills={showPills}
            unlocked={unlocked}
            curtainOpen={curtainOpen}
            onCurtainOpenChange={setCurtainOpen}
            thresholds={data.appSettings}
            onSuggestResource={data.suggestResource}
            onVolunteerLead={data.volunteerLead}
            onSaveEventPlan={data.saveEventPlan}
            onSendSignInLink={data.sendSignInLink}
            onConfirmYachtPaid={(paid) => data.updateMyPerson({ yacht_paid: paid })}
            onSaveMieventoIntents={(intents) => data.updateMyPerson({ mievento_intents: intents })}
            onBackToAvailability={() => setTab("entry")}
          />
        )}
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        CZR BHS87 Reunion &middot; Jan 9 &ndash; 30, 2027 &middot; Mark once, meet more.
      </footer>
    </div>
  );
}
