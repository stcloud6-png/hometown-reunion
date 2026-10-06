import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Filter, Moon, Sun } from "lucide-react";
import EntryForm from "@/components/entry-form";
import Dashboard from "@/components/dashboard";
import RollCallBar from "@/components/roll-call-bar";
import SettingsPopover from "@/components/settings-popover";
import YearbookViewer from "@/components/yearbook-viewer";
import { TicketWatchCard, TicketWatchMobile } from "@/components/ticket-watch";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useReunionData } from "@/lib/use-reunion-data";
import { useDarkMode } from "@/hooks/use-dark-mode";
import { readMyIdentity, logVisit, type MyIdentity } from "@/lib/reunion";

const STUB = import.meta.env.VITE_STUB_DATA === "true";

// Reads the `tab` query param from the hash URL (e.g. #/?tab=dashboard or
// #/?tab=yearbook) so a direct link can land members straight on the Group
// dashboard, or straight into the flipbook yearbook viewer, without them
// needing to click a nav button first.
function tabParamFromUrl(): "entry" | "dashboard" | "yearbook" | null {
  const query = window.location.hash.split("?")[1] ?? "";
  const value = new URLSearchParams(query).get("tab");
  return value === "dashboard" || value === "yearbook" || value === "entry" ? value : null;
}

function initialTabFromUrl(): "entry" | "dashboard" {
  return tabParamFromUrl() === "dashboard" ? "dashboard" : "entry";
}

// Visitors who arrive on a direct link (yearbook / dashboard) shouldn't get the
// ticket popup on top of what they came for.
const arrivedViaDirectLink = tabParamFromUrl() === "yearbook" || tabParamFromUrl() === "dashboard";

function initialYearbookOpenFromUrl(): boolean {
  return tabParamFromUrl() === "yearbook";
}

export default function Home() {
  const [tab, setTab] = useState<"entry" | "dashboard">(initialTabFromUrl);
  const { dark, toggle } = useDarkMode();
  const data = useReunionData({ stub: STUB });
  const [showPills, setShowPills] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [curtainOpen, setCurtainOpen] = useState(false);
  const [myIdentity, setMyIdentity] = useState<MyIdentity | null>(() => readMyIdentity());
  const [yearbookOpen, setYearbookOpen] = useState(initialYearbookOpenFromUrl);

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
              isAdmin={data.isAdmin}
              isTestAccount={data.isTestAccount}
              sessionEmail={data.sessionEmail}
              onSendSignInLink={data.sendSignInLink}
              onSignOut={data.signOut}
              onFetchMemberDirectory={data.fetchMemberDirectory}
              onSetMemberHidden={data.setMemberHidden}
              onTestSignIn={data.signInTestAccount}
              ticketHealth={data.ticketHealth}
              ticketRun={data.ticketRun}
            />
            <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={toggle} data-testid="button-dark-mode">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </nav>
        </div>
      </header>

      {data.isTestAccount && (
        <div className="border-b border-dashed bg-muted/60 px-4 py-2 text-center text-xs text-muted-foreground" data-testid="banner-test-account">
          Test account — your entries are private and left out of everyone else's results.{" "}
          <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={data.signOut} data-testid="button-banner-test-sign-out">
            Sign out
          </button>
        </div>
      )}

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
          showVolunteerNames={unlocked}
          activities={data.activities}
          clusterLeads={data.clusterLeads}
        />
      )}

      <main className={cn("mx-auto max-w-5xl px-4 py-8", tab === "entry" && data.tickets.length > 0 && "pb-24 lg:pb-8")}>
        {tab === "entry" ? (
          <>
            {/* Hero row: the side frame is pinned to the hero's height (list scrolls inside it),
                so the sign-in / availability form always starts right below the button. */}
            <div className={cn("mb-8", data.tickets.length > 0 && "lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8")}>
            <div className={cn("flex flex-col items-center gap-3 text-center", data.tickets.length > 0 && "lg:min-h-[480px] lg:justify-center")}>
              <img src={`${import.meta.env.BASE_URL}reunion-logo.jpg`} alt="CZR BHS87 Reunion" className="h-20 w-20 rounded-full object-cover shadow-md" />
              <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">CZR BHS87</h1>
              <p className="font-serif text-lg italic text-muted-foreground">The Meetup &amp; Planning Organizer</p>
              <p className="max-w-xl text-muted-foreground">
                CZR January 17&ndash;24, 2027. Tell the group when you're around and what you're up for
                &mdash; we'll find the times that work for the most of us.
              </p>
              {!(data.isAdmin && !data.isTestAccount) && (
                <>
                  <Button
                    size="lg"
                    className="mt-2 rounded-full px-8"
                    onClick={() => document.getElementById("entry-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    data-testid="button-mark-availability"
                  >
                    Mark my availability
                  </Button>
                  <p className="text-xs text-muted-foreground">Takes about two minutes</p>
                </>
              )}
            </div>
            {data.tickets.length > 0 && (
              <aside className="hidden lg:relative lg:block" data-testid="aside-ticket-watch">
                <div className="lg:absolute lg:inset-0">
                  <TicketWatchCard tickets={data.tickets} run={data.ticketRun} fitHeight />
                </div>
              </aside>
            )}
            </div>
            <TicketWatchMobile
              autoOpen={!yearbookOpen && !arrivedViaDirectLink}
              tickets={data.tickets}
              run={data.ticketRun}
              onRegister={data.isAdmin && !data.isTestAccount ? undefined : () => document.getElementById("entry-form")?.scrollIntoView({ behavior: "smooth" })}
            />
            <div id="entry-form" className="scroll-mt-20" />
            {data.isAdmin && !data.isTestAccount ? (
              <div className="mx-auto max-w-xl rounded-lg border border-dashed bg-muted/40 p-5 text-center" data-testid="notice-admin-no-entry">
                <p className="font-semibold">You're signed in with an admin account</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin accounts don't take part in availability, so there's no entry form here and
                  nothing you do as admin is counted in the group results.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={() => setTab("dashboard")} data-testid="button-admin-go-dashboard">Go to Group Dashboard</Button>
                  <Button size="sm" variant="outline" onClick={data.signOut} data-testid="button-admin-sign-out">Sign out of admin</Button>
                </div>
              </div>
            ) : (
            <EntryForm
              initial={data.myPerson(data.sessionEmail)}
              activities={data.activities}
              eventPlans={data.eventPlans}
              tickets={data.tickets}
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
              onCheckEmailTaken={data.entryEmailTaken}
            />
            )}
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
            isAdmin={data.isAdmin}
            ledActivityIds={data.ledActivityIds}
            onSaveChatLink={data.saveChatLink}
            onFetchMemberDirectory={data.fetchMemberDirectory}
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
