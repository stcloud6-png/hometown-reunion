import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Filter, Moon, Sun } from "lucide-react";
import EntryForm from "@/components/entry-form";
import Dashboard from "@/components/dashboard";
import RollCallBar from "@/components/roll-call-bar";
import SettingsPopover from "@/components/settings-popover";
import YearbookViewer from "@/components/yearbook-viewer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useReunionData } from "@/lib/use-reunion-data";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { readMyIdentity, logVisit, type MyIdentity } from "@/lib/reunion";

const STUB = import.meta.env.VITE_STUB_DATA === "true";

// Reads the `tab` query param from the hash URL (e.g. #/?tab=dashboard) so a
// direct link can land members straight on the Group dashboard without them
// needing to click the nav button first.
function initialTabFromUrl(): "entry" | "dashboard" {
  const query = window.location.hash.split("?")[1] ?? "";
  return new URLSearchParams(query).get("tab") === "dashboard" ? "dashboard" : "entry";
}

export default function Home() {
  const [tab, setTab] = useState<"entry" | "dashboard">(initialTabFromUrl);
  const { dark, toggle } = useDarkMode();
  const data = useReunionData({ stub: STUB });
  const [showPills, setShowPills] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [curtainOpen, setCurtainOpen] = useState(false);
  const [myIdentity, setMyIdentity] = useState<MyIdentity | null>(() => readMyIdentity());
  const [yearbookOpen, setYearbookOpen] = useState(false);

  // Log one anonymous page-visit per browser per day (Maintenance-mode traffic
  // indicator only) — never during stubbed/local QA runs.
  useEffect(() => {
    if (!STUB) logVisit();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}reunion-logo.jpg`} alt="CZR BHS87 Reunion" className="h-10 w-10 rounded-full object-cover" />
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help" data-testid="header-title-tooltip-trigger">
                  <p className="text-sm font-semibold leading-tight">CZR BHS87 Reunion</p>
                  <p className="text-xs text-muted-foreground">Jan 17 – 24, 2027</p>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">
                $30 for t-shirts and Dinner Ticket $50/$40-plus-one, Zelle 813-966-8151, and mailing address provided via text.
              </TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-1.5 border-l pl-2.5" data-testid="header-partner-logos">
              <a
                href="https://canalzonereunion.com/"
                target="_blank"
                rel="noopener noreferrer"
                title="Canal Zone Reunion site"
                data-testid="link-czr-logo"
                className="block h-8 w-8 overflow-hidden rounded-md bg-background ring-1 ring-border transition-transform hover:scale-105"
              >
                <img src={`${import.meta.env.BASE_URL}czr-logo.jpg`} alt="Canal Zone Reunion" className="h-full w-full object-cover" />
              </a>
              <a
                href="https://www.mieventos.com/event-multiple-detail/czr-2027"
                target="_blank"
                rel="noopener noreferrer"
                title="MiEvento tickets"
                data-testid="link-mievento-logo"
                className="block h-8 w-8 overflow-hidden rounded-md bg-white ring-1 ring-border transition-transform hover:scale-105"
              >
                <img src={`${import.meta.env.BASE_URL}mievento-logo.jpg`} alt="MiEvento" className="h-full w-full object-contain p-1" />
              </a>
              <button
                type="button"
                onClick={() => setYearbookOpen(true)}
                title="Flip through the Yearbook"
                data-testid="button-yearbook-logo"
                className="block h-8 w-8 overflow-hidden rounded-md bg-background ring-1 ring-border transition-transform hover:scale-105"
              >
                <img src={`${import.meta.env.BASE_URL}yearbook-logo.jpg`} alt="Yearbook" className="h-full w-full object-cover" />
              </button>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCurtainOpen(true)} data-testid="button-curtain-header">
                    <Filter className="h-4 w-4" /> Filter
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs">
                  Filter by interest anytime — use Filter button or hover the left edge of the screen.
                </TooltipContent>
              </Tooltip>
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

      {tab === "dashboard" && (
        <RollCallBar
          people={data.people}
          isDemo={data.isDemo}
          sessionEmail={data.sessionEmail}
          myPerson={data.myPerson(data.sessionEmail)}
          onSendSignInLink={data.sendSignInLink}
          onConfirmYachtPaid={(paid) => data.updateMyPerson({ yacht_paid: paid })}
          onSaveMieventoTicketStatus={(status) => data.updateMyPerson({ mievento_ticket_status: status })}
          variant="header"
        />
      )}

      <main className="mx-auto max-w-5xl px-4 py-8">
        {tab === "entry" ? (
          <>
            <div className="mb-10 flex flex-col items-center gap-3 text-center">
              <img src={`${import.meta.env.BASE_URL}reunion-logo.jpg`} alt="CZR BHS87 Reunion" className="h-20 w-20 rounded-full object-cover shadow-md" />
              <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">CZR BHS87</h1>
              <p className="font-serif text-lg italic text-muted-foreground">The Meetup &amp; Planning Organizer</p>
              <p className="max-w-xl text-muted-foreground">
                CZR January 17&ndash;24, 2027. Tell the group when you're around and what you're up for
                &mdash; we'll find the times that work for the most of us.
              </p>
              <Button asChild size="lg" className="mt-2 rounded-full px-8" data-testid="button-mark-availability">
                <a href="#entry-form">Mark my availability</a>
              </Button>
              <p className="text-xs text-muted-foreground">Takes about two minutes</p>
            </div>
            <div id="entry-form" />
            <EntryForm
              initial={data.myPerson(data.sessionEmail)}
              activities={data.activities}
              eventPlans={data.eventPlans}
              onSave={async (person) => {
                await data.savePerson(person);
                setMyIdentity({ name: person.name, email: person.email ?? "" });
              }}
              onSuggestActivity={data.suggestActivity}
              onGoToDashboard={() => setTab("dashboard")}
              people={data.people}
              isDemo={data.isDemo}
              sessionEmail={data.sessionEmail}
              onSendSignInLink={data.sendSignInLink}
              onConfirmYachtPaid={(paid) => data.updateMyPerson({ yacht_paid: paid })}
              onSaveMieventoIntents={(intents) => data.updateMyPerson({ mievento_intents: intents })}
              onSaveMieventoTicketStatus={(status) => data.updateMyPerson({ mievento_ticket_status: status })}
              myIdentity={myIdentity}
              onSignOut={data.signOut}
              linkError={data.linkError}
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
            onBackToAvailability={() => setTab("entry")}
          />
        )}
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        CZR BHS87 Reunion &middot; Jan 9 &ndash; 30, 2027 &middot; Mark once, meet more.
      </footer>

      <YearbookViewer open={yearbookOpen} onOpenChange={setYearbookOpen} />
    </div>
  );
}
