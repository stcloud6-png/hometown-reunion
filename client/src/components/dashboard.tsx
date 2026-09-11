import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Info, Download, ShieldCheck, Anchor, ClipboardCheck, CalendarHeart, Lock, ArrowLeft,
  ChevronDown, Flame, Users, Grid3x3, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import YachtPaymentDialog from "@/components/yacht-payment-dialog";
import MieventoDialog from "@/components/mievento-dialog";
import {
  type Activity,
  type ClusterLead,
  type ClusterResource,
  type EventPlan,
  type EventPlanStatus,
  type Period,
  type Person,
  CLUSTER_RESOURCE_LINKS,
  CLUSTER_THRESHOLDS,
  DAYS,
  EVENT_PLAN_STATUS_LABEL,
  MIEVENTO_INTENT_LABEL,
  PERIODS,
  PERIOD_LABEL,
  STATUS_LABEL,
  bestWindowsForActivity,
  bestWindowsRanked,
  clusterStage,
  clusterSummaries,
  exportAvailabilityCsv,
  formatDateRange,
  isYachtLockSlot,
  labelForTag,
  mieventoDays,
  mostRecentEditor,
  pctScaleBg,
  pctScaleColor,
  sharedCommitments,
  tallyWindow,
} from "@/lib/reunion";

interface DashboardProps {
  people: Person[];
  activities: Activity[];
  clusterResources: ClusterResource[];
  clusterLeads: ClusterLead[];
  eventPlans: EventPlan[];
  isDemo: boolean;
  sessionEmail: string | null;
  myPerson: Person | null;
  showPills: boolean;
  unlocked: boolean;
  onSuggestResource: (resource: ClusterResource) => Promise<void>;
  onVolunteerLead: (lead: ClusterLead) => Promise<void>;
  onSaveEventPlan: (plan: EventPlan) => Promise<void>;
  onSendSignInLink: (email: string) => Promise<void>;
  onConfirmYachtPaid: (paid: boolean) => Promise<void>;
  onSaveMieventoIntents: (intents: Record<string, string>) => Promise<void>;
  onBackToAvailability: () => void;
}

/** Collapsible dashboard section wrapper, matching the live site's collapse/expand section chrome. */
function CollapsibleSection({
  icon,
  title,
  subcopy,
  defaultOpen = false,
  testId,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  subcopy: string;
  defaultOpen?: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card data-testid={testId}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left" data-testid={`${testId}-trigger`}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {icon}
                  {title}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{subcopy}</p>
              </div>
              <ChevronDown className={cn("mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function Dashboard({
  people,
  activities,
  clusterResources,
  clusterLeads,
  eventPlans,
  isDemo,
  sessionEmail,
  myPerson,
  showPills,
  unlocked,
  onSuggestResource,
  onVolunteerLead,
  onSaveEventPlan,
  onSendSignInLink,
  onConfirmYachtPaid,
  onSaveMieventoIntents,
  onBackToAvailability,
}: DashboardProps) {
  const rankedWindows = useMemo(() => bestWindowsRanked(people, 6), [people]);
  const clusters = useMemo(() => clusterSummaries(people, activities), [people, activities]);
  const commitments = useMemo(() => sharedCommitments(people), [people]);
  const lastEditor = useMemo(() => mostRecentEditor(people), [people]);

  const visibleClusters = clusters
    .filter((c) => c.interestedCount > 0)
    .filter((c, idx) => unlocked || c.interestedCount >= CLUSTER_THRESHOLDS.publicMinInterest || idx < CLUSTER_THRESHOLDS.publicTop);

  return (
    <div className="space-y-8" data-testid="view-dashboard">
      {isDemo && <Badge variant="secondary">Showing demo data</Badge>}

      <CollapsibleSection
        icon={<Flame className="h-5 w-5" />}
        title="Best windows for the group"
        subcopy="Best days for the group, ranked — percentage shows how much of the group in town is free that morning, afternoon or evening."
        testId="section-best-windows"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {rankedWindows.map((row) => (
            <div key={row.day.iso} className="rounded-md border p-3" data-testid={`window-row-${row.day.iso}`}>
              <p className="text-sm font-medium">{row.day.short}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PERIODS.map((period) => {
                  const cell = row.periods[period];
                  return (
                    <span
                      key={period}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={cell ? { color: pctScaleColor(cell.pct), backgroundColor: pctScaleBg(cell.pct) } : { color: "var(--muted-foreground)" }}
                      title={cell ? `${cell.available} of ${cell.total} free` : "Yacht Club Dinner/Dance — everyone's there"}
                      data-testid={`window-${row.day.iso}-${period}`}
                    >
                      {PERIOD_LABEL[period]} {cell ? `${cell.pct}%` : "—"}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
          {rankedWindows.length === 0 && <p className="text-sm text-muted-foreground">No responses yet.</p>}
        </div>
      </CollapsibleSection>

      <RollCallCard
        people={people}
        isDemo={isDemo}
        sessionEmail={sessionEmail}
        myPerson={myPerson}
        onSendSignInLink={onSendSignInLink}
        onConfirmYachtPaid={onConfirmYachtPaid}
        onSaveMieventoIntents={onSaveMieventoIntents}
      />

      <CollapsibleSection
        title="Interest clusters"
        subcopy="Interests several classmates share — the windows where the most are free, plus resources to help each group plan. Know a venue or tool? Suggest it for the group to consider."
        defaultOpen
        testId="section-interest-clusters"
      >
        <div className="space-y-4">
          {visibleClusters.map((cluster) => {
            const plan = eventPlans.find((p) => p.activity_id === cluster.activity.id);
            const lead = clusterLeads.find((l) => l.activity_id === cluster.activity.id);
            const resources = [
              ...(CLUSTER_RESOURCE_LINKS[cluster.activity.id] ?? []),
              ...clusterResources.filter((r) => r.activity_id === cluster.activity.id).map((r) => ({ label: r.label, url: r.url })),
            ];
            const topWindows = bestWindowsForActivity(people, cluster.activity.id, 3);
            const spotsLeft = plan && typeof plan.max_size === "number" ? Math.max(plan.max_size - cluster.interestedCount, 0) : null;
            return (
              <div key={cluster.activity.id} className="rounded-md border p-4" data-testid={`cluster-${cluster.activity.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{cluster.activity.label}</span>
                    <Badge variant="secondary">{cluster.interestedCount} interested</Badge>
                    <Badge variant="outline" data-testid={`badge-stage-${cluster.activity.id}`}>{clusterStage(cluster.interestedCount)}</Badge>
                  </div>
                </div>

                {cluster.interestedNames.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {cluster.interestedNames.map((n) => (
                      <span key={n} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{n}</span>
                    ))}
                  </div>
                )}

                {topWindows.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {topWindows.map((w) => (
                      <li key={`${w.iso}-${w.period}`}>
                        {w.day.short}, {PERIOD_LABEL[w.period]} — {w.available} of {w.total} free
                      </li>
                    ))}
                  </ul>
                )}

                {resources.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resources &amp; tools</p>
                    <ul className="mt-1 list-inside list-disc text-sm">
                      {resources.map((r) => (
                        <li key={r.url}>
                          <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                            {r.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {lead ? (
                    <p className="text-sm text-muted-foreground">
                      Event Organizer: {lead.lead_name} — the interest group will be notified and a group chat will follow.
                    </p>
                  ) : (
                    <VolunteerLeadForm
                      activityId={cluster.activity.id}
                      myPerson={myPerson}
                      sessionEmail={sessionEmail}
                      onVolunteer={onVolunteerLead}
                    />
                  )}

                  {plan && (
                    <div className="rounded-md border bg-muted/50 p-3 text-sm" data-testid={`plan-box-${cluster.activity.id}`}>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group's plan</p>
                        <Badge variant={plan.status === "open" ? "default" : "secondary"}>{EVENT_PLAN_STATUS_LABEL[plan.status]}</Badge>
                      </div>
                      <p className="mt-1 font-medium">
                        {plan.event_date && formatDateRange(plan.event_date, plan.event_date)}
                        {plan.start_time && ` · starts ${plan.start_time}`}
                      </p>
                      {plan.venue && <p className="text-muted-foreground">Meet at {plan.venue}</p>}
                      {spotsLeft !== null && (
                        <p className="mt-1 text-muted-foreground">
                          Max group size {plan.max_size} · {cluster.interestedCount} interested · {spotsLeft} spots left
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">It's also reflected on your schedule in "Mark your time slots."</p>
                      {unlocked && (
                        <EventPlanEditor activityId={cluster.activity.id} initial={plan} onSave={onSaveEventPlan} sessionEmail={sessionEmail} />
                      )}
                    </div>
                  )}
                </div>

                <SuggestResourceForm activityId={cluster.activity.id} onSuggest={onSuggestResource} />
              </div>
            );
          })}
          {visibleClusters.length === 0 && (
            <p className="text-sm text-muted-foreground">No interests marked yet.</p>
          )}
          <p className="pt-1 text-xs text-muted-foreground">
            {unlocked
              ? "Maintenance mode: every cluster with at least one interested classmate is shown."
              : "More clusters appear here publicly once they reach 6 interested classmates (or are one of the top 2 most popular)."}
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Grid3x3 className="h-5 w-5" />}
        title="Group availability heatmap"
        subcopy="Greener = more of the group can make it. Tap any cell for the full breakdown."
        testId="section-heatmap"
      >
        <AvailabilityHeatmap people={people} onBackToAvailability={onBackToAvailability} />
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Users className="h-5 w-5" />}
        title="Who's in town when"
        subcopy="Everyone who has responded so far."
        testId="section-who-is-in-town"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">In town</th>
                <th className="py-2 pr-4">Interested in</th>
                <th className="py-2 pr-4">MiEvento</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const interestLabels = p.interests
                  .map((id) => activities.find((a) => a.id === id)?.label)
                  .filter((l): l is string => !!l);
                const mieventoLabels = new Set<string>();
                for (const day of Object.values(p.slots ?? {})) {
                  for (const slot of Object.values(day ?? {})) {
                    if (slot?.s === "busy" && slot.t && slot.t !== "yacht-club") {
                      mieventoLabels.add(labelForTag(slot.t, activities));
                    }
                  }
                }
                return (
                  <tr key={p.name} className="border-b align-top last:border-0" data-testid={`row-person-${p.name}`}>
                    <td className="py-2 pr-4 font-medium">{p.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatDateRange(p.arrival, p.departure)}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {interestLabels.length > 0 ? (
                          interestLabels.map((label) => (
                            <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label}</span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {mieventoLabels.size > 0 ? (
                          Array.from(mieventoLabels).map((label) => (
                            <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label}</span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2">
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" /> Protected
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground" data-testid="text-who-is-in-town-footnote">
            "Private / unavailable" blocks time on the heatmap without ever showing the reason.
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        icon={<CalendarClock className="h-5 w-5" />}
        title="Shared commitments"
        subcopy="Times blocked by existing events the group already knows about."
        testId="section-shared-commitments"
      >
        {commitments.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {commitments.map(({ event, count }) => (
              <li key={event.id} className="flex items-center justify-between rounded-md border p-2 text-sm" data-testid={`commitment-${event.id}`}>
                <div>
                  <p className="font-medium">{event.label}</p>
                  {event.note && <p className="text-xs text-muted-foreground">{event.note}</p>}
                </div>
                <Badge variant="secondary">{count} on schedule</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No shared commitments logged yet.</p>
        )}
      </CollapsibleSection>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportAvailabilityCsv(people, activities)} data-testid="button-export">
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="ghost" size="icon" aria-label="Respondents" disabled data-testid="icon-community">
            <Users className="h-4 w-4" />
          </Button>
        </div>
        {unlocked && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Respondent info" data-testid="maintenance-icon">
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="text-sm">
                {people.length} of an expected 62 classmates have shared their availability so far.
              </PopoverContent>
            </Popover>
            {lastEditor && (
              <span data-testid="text-last-editor">
                Last edited by {lastEditor.name} · {new Date(lastEditor.updated_at).toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AvailabilityHeatmap({ people, onBackToAvailability }: { people: Person[]; onBackToAvailability: () => void }) {
  const rows = useMemo(
    () =>
      DAYS.map((day) => ({
        day,
        cells: PERIODS.map((period) => {
          const locked = isYachtLockSlot(day.iso, period);
          const tally = tallyWindow(people, day.iso, period);
          const inTown = people.length - tally.out.length;
          const pct = inTown > 0 ? Math.round((tally.ok.length / inTown) * 100) : 0;
          return { period, tally, inTown, pct, locked };
        }),
      })),
    [people],
  );

  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">No responses yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs" data-testid="heatmap-grid">
          <thead>
            <tr>
              <th className="text-left text-muted-foreground">Day</th>
              {PERIODS.map((p) => (
                <th key={p} className="px-2 text-muted-foreground">{PERIOD_LABEL[p]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ day, cells }) => (
              <tr key={day.iso}>
                <td className="pr-2 text-right font-medium text-muted-foreground">{day.short}</td>
                {cells.map(({ period, tally, inTown, pct, locked }) => {
                  if (locked) {
                    return (
                      <td key={period}>
                        <div
                          className="h-8 w-20 rounded-sm border-2 border-card-border bg-muted"
                          data-testid={`heatmap-cell-${day.iso}-${period}`}
                          title="Yacht Club 87 Dinner/Dance — everyone's there"
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={period}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="h-8 w-20 rounded-sm border border-card-border text-[10px] font-bold"
                            style={{ backgroundColor: pctScaleBg(pct), color: pctScaleColor(pct) }}
                            data-testid={`heatmap-cell-${day.iso}-${period}`}
                          >
                            {inTown > 0 ? `${tally.ok.length}/${inTown} \u00b7 ${pct}%` : "—"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-sm">
                          <p className="font-medium">{day.label} — {PERIOD_LABEL[period]}</p>
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            <li>{STATUS_LABEL.ok}: {tally.ok.length}</li>
                            <li>{STATUS_LABEL.maybe}: {tally.maybe.length}</li>
                            <li>{STATUS_LABEL.busy}: {tally.busy.length}</li>
                            <li>{STATUS_LABEL.private}: {tally.private.length}</li>
                            <li>{STATUS_LABEL["pool-day"]}: {tally["pool-day"].length}</li>
                            <li>Out of town: {tally.out.length}</li>
                          </ul>
                          {tally.ok.length > 0 && (
                            <p className="mt-2 text-xs">Available: {tally.ok.join(", ")}</p>
                          )}
                        </PopoverContent>
                      </Popover>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground" data-testid="heatmap-legend">
        <span>Fewer free</span>
        <span
          className="h-3 flex-1 rounded-full"
          style={{ background: `linear-gradient(90deg, ${pctScaleBg(0)}, ${pctScaleBg(100)})` }}
        />
        <span>More free</span>
      </div>

      <div className="flex justify-center">
        <Button variant="outline" size="sm" onClick={onBackToAvailability} data-testid="button-back-to-availability">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to my availability
        </Button>
      </div>
    </div>
  );
}

interface RollCallCardProps {
  people: Person[];
  isDemo: boolean;
  sessionEmail: string | null;
  myPerson: Person | null;
  onSendSignInLink: (email: string) => Promise<void>;
  onConfirmYachtPaid: (paid: boolean) => Promise<void>;
  onSaveMieventoIntents: (intents: Record<string, string>) => Promise<void>;
}

function RollCallCard({ people, isDemo, sessionEmail, myPerson, onSendSignInLink, onConfirmYachtPaid, onSaveMieventoIntents }: RollCallCardProps) {
  const attending = people.filter((p) => p.attending === true);
  const notSure = people.filter((p) => p.attending === false);
  const unanswered = people.filter((p) => p.attending == null);
  const supportVolunteers = people.filter((p) => p.volunteer_support);
  const leadVolunteers = people.filter((p) => p.volunteer_lead);
  const yachtPaid = people.filter((p) => p.yacht_paid);

  const days = mieventoDays();
  const responded = people.filter((p) => p.mievento_intents && Object.keys(p.mievento_intents).length > 0);
  const veryCount = people.reduce((sum, p) => sum + days.filter((d) => p.mievento_intents?.[d.iso] === "very").length, 0);

  return (
    <Card data-testid="card-roll-call">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" /> Roll call
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Who's confirmed, who's helping, who's paid for the Yacht Club dinner, and MiEvento interest so far.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-2xl font-semibold text-primary">{attending.length}</p>
            <p className="text-sm text-muted-foreground">Count me in</p>
            <p className="text-xs text-muted-foreground">{notSure.length} not sure · {unanswered.length} unanswered</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-2xl font-semibold text-primary">{leadVolunteers.length}</p>
            <p className="text-sm text-muted-foreground">Volunteer leads</p>
            <p className="text-xs text-muted-foreground">{supportVolunteers.length} offered to help support</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="flex items-center gap-1 text-2xl font-semibold text-primary">
              <Anchor className="h-5 w-5" /> {yachtPaid.length}
            </p>
            <p className="text-sm text-muted-foreground">Yacht Club paid</p>
            <div className="mt-2">
              <YachtPaymentDialog
                isDemo={isDemo}
                sessionEmail={sessionEmail}
                myPerson={myPerson}
                onSendSignInLink={onSendSignInLink}
                onConfirmPaid={onConfirmYachtPaid}
              />
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="flex items-center gap-1 text-2xl font-semibold text-primary">
              <CalendarHeart className="h-5 w-5" /> {responded.length}
            </p>
            <p className="text-sm text-muted-foreground">MiEvento responses</p>
            <p className="text-xs text-muted-foreground">{veryCount} "{MIEVENTO_INTENT_LABEL.very.toLowerCase()}" picks across the week</p>
            <div className="mt-2">
              <MieventoDialog
                isDemo={isDemo}
                sessionEmail={sessionEmail}
                myPerson={myPerson}
                onSendSignInLink={onSendSignInLink}
                onSaveIntents={onSaveMieventoIntents}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VolunteerLeadForm({
  activityId,
  myPerson,
  sessionEmail,
  onVolunteer,
}: {
  activityId: string;
  myPerson: Person | null;
  sessionEmail: string | null;
  onVolunteer: (lead: ClusterLead) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(false);
  const signedIn = !!sessionEmail && !!myPerson;

  async function submit() {
    if (!myPerson) return;
    setSubmitting(true);
    try {
      await onVolunteer({ activity_id: activityId, lead_name: myPerson.name, lead_email: myPerson.email ?? sessionEmail });
      setSelected(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`text-volunteer-signin-${activityId}`}>
        Sign in from the Roll call card above to volunteer as this event's Organizer.
      </p>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm hover-elevate active-elevate-2 rounded-md p-1">
      <input
        type="radio"
        checked={selected}
        onChange={submit}
        disabled={submitting}
        className="h-4 w-4"
        data-testid={`radio-volunteer-lead-${activityId}`}
      />
      <span className="flex items-center gap-1">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Be the first to volunteer as Event Organizer for this event
      </span>
    </label>
  );
}

function SuggestResourceForm({ activityId, onSuggest }: { activityId: string; onSuggest: (resource: ClusterResource) => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  async function submit() {
    if (!label.trim() || !url.trim()) return;
    await onSuggest({ activity_id: activityId, label: label.trim(), url: url.trim() });
    setLabel("");
    setUrl("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="mt-2 underline underline-offset-2" data-testid={`button-suggest-resource-${activityId}`}>
          + Suggest a resource or tool
        </Button>
      </PopoverTrigger>
      <PopoverContent className="space-y-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" data-testid={`input-resource-label-${activityId}`} />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" data-testid={`input-resource-url-${activityId}`} />
        <Button size="sm" onClick={submit} data-testid={`button-submit-resource-${activityId}`}>
          Add
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function EventPlanEditor({
  activityId,
  initial,
  sessionEmail,
  onSave,
}: {
  activityId: string;
  initial: EventPlan;
  sessionEmail: string | null;
  onSave: (plan: EventPlan) => Promise<void>;
}) {
  const [venue, setVenue] = useState(initial.venue ?? "");
  const [eventDate, setEventDate] = useState(initial.event_date ?? "");
  const [startTime, setStartTime] = useState(initial.start_time ?? "");
  const [maxSize, setMaxSize] = useState(initial.max_size?.toString() ?? "");
  const [status, setStatus] = useState(initial.status);

  async function submit() {
    await onSave({
      activity_id: activityId,
      status,
      event_date: eventDate || null,
      start_time: startTime || null,
      venue: venue || null,
      max_size: maxSize ? Number(maxSize) : null,
      updated_by: sessionEmail,
    });
  }

  return (
    <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2" data-testid={`event-plan-editor-${activityId}`}>
      <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Venue" data-testid={`input-plan-venue-${activityId}`} />
      <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} data-testid={`input-plan-date-${activityId}`} />
      <Input value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="Start time (e.g. 11:30am)" data-testid={`input-plan-time-${activityId}`} />
      <Input type="number" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} placeholder="Max size" data-testid={`input-plan-maxsize-${activityId}`} />
      <Select value={status} onValueChange={(v) => setStatus(v as EventPlanStatus)}>
        <SelectTrigger data-testid={`select-plan-status-${activityId}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(EVENT_PLAN_STATUS_LABEL) as EventPlanStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {EVENT_PLAN_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={submit} className="sm:col-span-2" data-testid={`button-save-plan-${activityId}`}>
        Save plan
      </Button>
    </div>
  );
}
