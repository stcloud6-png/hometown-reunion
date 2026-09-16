import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Info, Download, ShieldCheck, Lock, ArrowLeft,
  ChevronDown, Flame, Users, Grid3x3, CalendarClock, X, Clock, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Activity,
  type ClusterLead,
  type ClusterResource,
  type ClusterThresholds,
  type EventPlan,
  type EventPlanStatus,
  type MyIdentity,
  type Period,
  type Person,
  CLUSTER_RESOURCE_LINKS,
  CLUSTER_THRESHOLDS,
  DAYS,
  EVENT_PLAN_STATUS_LABEL,
  EXPECTED_HEADCOUNT,
  PERIODS,
  PERIOD_LABEL,
  STATUS_LABEL,
  bestWindowsForActivity,
  bestWindowsRanked,
  clusterStage,
  clusterSummaries,
  exportAvailabilityCsv,
  formatDateRange,
  interestPillCounts,
  isYachtLockSlot,
  labelForTag,
  mostRecentEditor,
  fetchVisitCount,
  pctScaleBg,
  pctScaleColor,
  recentEditors,
  scopeByInterest,
  sharedCommitments,
  tallyWindow,
  tallyWindowDetailed,
} from "@/lib/reunion";

/** True when the signed-in person's email matches the cluster lead's email, case-insensitively. */
function isClusterLead(lead: ClusterLead | undefined, sessionEmail: string | null, myIdentity: MyIdentity | null): boolean {
  if (!lead?.lead_email) return false;
  const myEmail = sessionEmail ?? myIdentity?.email ?? null;
  if (!myEmail) return false;
  return myEmail.trim().toLowerCase() === lead.lead_email.trim().toLowerCase();
}

const PERIOD_SHORT_LABEL: Record<Period, string> = { m: "AM", a: "PM", e: "EVE" };

interface DashboardProps {
  people: Person[];
  activities: Activity[];
  clusterResources: ClusterResource[];
  clusterLeads: ClusterLead[];
  eventPlans: EventPlan[];
  isDemo: boolean;
  sessionEmail: string | null;
  myPerson: Person | null;
  myIdentity: MyIdentity | null;
  showPills: boolean;
  unlocked: boolean;
  curtainOpen: boolean;
  onCurtainOpenChange: (open: boolean) => void;
  thresholds?: ClusterThresholds;
  onSuggestResource: (resource: ClusterResource) => Promise<void>;
  onVolunteerLead: (lead: ClusterLead) => Promise<void>;
  onSaveEventPlan: (plan: EventPlan) => Promise<void>;
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
  myIdentity,
  showPills,
  unlocked,
  curtainOpen,
  onCurtainOpenChange,
  thresholds = CLUSTER_THRESHOLDS,
  onSuggestResource,
  onVolunteerLead,
  onSaveEventPlan,
  onBackToAvailability,
}: DashboardProps) {
  const [interestFilter, setInterestFilter] = useState<string | null>(null);
  const pillCounts = useMemo(() => interestPillCounts(people, activities), [people, activities]);
  const filteredPeople = useMemo(() => scopeByInterest(people, interestFilter), [people, interestFilter]);

  const rankedWindows = useMemo(() => bestWindowsRanked(filteredPeople, 6), [filteredPeople]);
  const clusters = useMemo(() => clusterSummaries(filteredPeople, activities), [filteredPeople, activities]);
  const commitments = useMemo(() => sharedCommitments(people), [people]);
  const lastEditor = useMemo(() => mostRecentEditor(people), [people]);
  const lastFiveEditors = useMemo(() => recentEditors(people, 5), [people]);

  // Anonymous-visit traffic counters (Maintenance mode only) — fetched fresh
  // each time Maintenance is unlocked, never against demo/stub data.
  const [visitSinceLastSave, setVisitSinceLastSave] = useState<number | null>(null);
  const [visitLast5Days, setVisitLast5Days] = useState<number | null>(null);
  useEffect(() => {
    if (!unlocked || isDemo) return;
    let cancelled = false;
    const sinceLastIso = lastEditor?.updated_at ?? new Date(0).toISOString();
    const fiveDaysAgoIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([fetchVisitCount(sinceLastIso), fetchVisitCount(fiveDaysAgoIso)]).then(([sinceLast, last5]) => {
      if (cancelled) return;
      setVisitSinceLastSave(sinceLast);
      setVisitLast5Days(last5);
    });
    return () => {
      cancelled = true;
    };
  }, [unlocked, isDemo, lastEditor?.updated_at]);

  const visibleClusters = clusters
    .filter((c) => c.interestedCount > 0)
    .filter((c, idx) => unlocked || c.interestedCount >= thresholds.publicMinInterest || idx < thresholds.publicTop);

  return (
    <div className="space-y-8" data-testid="view-dashboard">
      {isDemo && <Badge variant="secondary">Showing demo data</Badge>}

      <InterestCurtain
        pillCounts={pillCounts}
        activeFilter={interestFilter}
        onSelect={setInterestFilter}
        open={curtainOpen}
        onOpenChange={onCurtainOpenChange}
        showPills={showPills}
      />

      <CollapsibleSection
        icon={<Flame className="h-5 w-5" />}
        title="Best windows for the group"
        subcopy="Best days for the group — bar shades show how free each morning, afternoon and evening are (hover for detail)."
        testId="section-best-windows"
      >
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {[0, 1].map((colIdx) => {
            const colRows = rankedWindows
              .map((row, idx) => ({ row, rank: idx + 1 }))
              .filter((_, i) => i % 2 === colIdx);
            if (colRows.length === 0) return null;
            return (
              <div key={colIdx} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 shrink-0" />
                  <span className="w-[92px] shrink-0" />
                  <div className="grid flex-1 grid-cols-3 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {PERIODS.map((period) => (
                      <span key={period}>{PERIOD_SHORT_LABEL[period]}</span>
                    ))}
                  </div>
                </div>
                {colRows.map(({ row, rank }) => (
                  <div key={row.day.iso} className="flex items-center gap-2" data-testid={`window-row-${row.day.iso}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(150_45%_32%)] text-xs font-bold text-white" data-testid={`window-rank-${row.day.iso}`}>
                      {rank}
                    </span>
                    <p className="w-[92px] shrink-0 truncate text-sm font-medium">{row.day.short}</p>
                    <div className="grid flex-1 grid-cols-3 gap-1.5">
                      {PERIODS.map((period) => {
                        const cell = row.periods[period];
                        const locked = !cell && isYachtLockSlot(row.day.iso, period);
                        return locked ? (
                          <div
                            key={period}
                            className="h-6 w-full rounded-full bg-[hsl(220_10%_15%)]"
                            title="Yacht Club 87 Dinner/Dance — everyone's there. $50pp / $40 plus-one, Zelle 813-966-8151 (or text to request a mailing address)."
                            data-testid={`window-${row.day.iso}-${period}`}
                          />
                        ) : cell ? (
                          <div
                            key={period}
                            className="relative h-6 w-full overflow-hidden rounded-full bg-muted"
                            title={`${cell.available} of ${cell.total} free`}
                            data-testid={`window-${row.day.iso}-${period}`}
                          >
                            <div
                              className="flex h-full items-center justify-center rounded-full text-[10px] font-bold"
                              style={{
                                width: `${Math.max(cell.pct, 30)}%`,
                                backgroundColor: cell.pct < 20 ? "hsl(35 35% 78%)" : pctScaleBg(cell.pct),
                                color: cell.pct < 20 ? "hsl(35 40% 25%)" : pctScaleColor(cell.pct),
                              }}
                            >
                              {cell.pct}%
                            </div>
                          </div>
                        ) : (
                          <span key={period} className="flex h-6 items-center justify-center text-xs text-muted-foreground">—</span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {rankedWindows.length === 0 && <p className="text-sm text-muted-foreground">No responses yet.</p>}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Interest clusters"
        subcopy="Interests several classmates share — the windows where the most are free, plus resources to help each group plan. Know a venue or tool? Suggest it for the group to consider."
        defaultOpen
        testId="section-interest-clusters"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                    <span className="font-bold text-[hsl(43_65%_38%)] underline underline-offset-2 dark:text-[hsl(43_75%_65%)]">{cluster.activity.label}</span>
                    <Badge variant="secondary">{cluster.interestedCount} interested</Badge>
                    <Badge variant="outline" data-testid={`badge-stage-${cluster.activity.id}`}>{clusterStage(cluster.interestedCount, thresholds)}</Badge>
                  </div>
                </div>

                {unlocked && (
                  <div className="mt-2 space-y-1 rounded-md border border-dashed bg-muted/40 p-2 text-xs text-muted-foreground" data-testid={`maintenance-note-${cluster.activity.id}`}>
                    <p>Maintenance view — every interest shared by 2+ classmates. Tune the stage thresholds from the popup that appears when you turn Maintenance on.</p>
                    <p>Ticket-check: 5 of 9 counted in · 8% of expected {EXPECTED_HEADCOUNT} — date-locking opens at 50%</p>
                  </div>
                )}

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
                    <div className="mt-1 space-y-1 text-sm">
                      {resources.map((r) => (
                        <p key={r.url}>
                          <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                            {r.label}
                          </a>
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {lead?.lead_name ? (
                    <div className="text-sm text-muted-foreground">
                      <p>
                        <span className="font-bold text-foreground">Event Organizer: {lead.lead_name}</span> — the interest group will be notified and a group chat will follow.
                      </p>
                      <ChatLinkEditor
                        activityId={cluster.activity.id}
                        lead={lead}
                        canEdit={unlocked || isClusterLead(lead, sessionEmail, myIdentity)}
                        onSave={onVolunteerLead}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <VolunteerLeadForm
                        activityId={cluster.activity.id}
                        myIdentity={myIdentity}
                        onVolunteer={onVolunteerLead}
                      />
                      <ChatLinkEditor
                        activityId={cluster.activity.id}
                        lead={lead ?? { activity_id: cluster.activity.id, lead_name: null }}
                        canEdit={unlocked}
                        onSave={onVolunteerLead}
                      />
                    </div>
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
                      {(unlocked || isClusterLead(lead, sessionEmail, myIdentity)) && (
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
            <p className="text-sm text-muted-foreground lg:col-span-2">No interests marked yet.</p>
          )}
          <p className="pt-1 text-xs text-muted-foreground lg:col-span-2" data-testid="text-cluster-footnote">
            Gathering = under {thresholds.candidateAt} interested · Sub-event candidate = {thresholds.candidateAt}+, ready to propose dates · Spin-off = {thresholds.spinoffAt}+, plan a second session. Group sees the top {thresholds.publicTop} clusters (plus any over {thresholds.publicMinInterest} interested). Date-locking opens on Sub-event candidates once Count-me-in passes half of the expected {EXPECTED_HEADCOUNT}.
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Grid3x3 className="h-5 w-5" />}
        title="Group availability heatmap"
        subcopy="Greener = more of the group can make it. Tap any cell for the full breakdown."
        testId="section-heatmap"
      >
        <AvailabilityHeatmap people={filteredPeople} activities={activities} onBackToAvailability={onBackToAvailability} />
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
              {filteredPeople.map((p) => {
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
            {commitments.map(({ event, count, dates }) => (
              <li key={event.id} className="rounded-md border p-2 text-sm" data-testid={`commitment-${event.id}`}>
                <p className="font-medium">{event.label}</p>
                {event.note && <p className="text-xs text-muted-foreground">{event.note}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{count} block{count === 1 ? "" : "s"} · {dates.join(", ")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No shared commitments logged yet.</p>
        )}
      </CollapsibleSection>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          {unlocked && (
            <Button variant="outline" size="sm" onClick={() => exportAvailabilityCsv(people, activities)} data-testid="button-export">
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
          )}
          {unlocked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Respondents" data-testid="icon-community">
                  <Users className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {lastFiveEditors.length > 0 ? (
                  <div className="space-y-1">
                    <p className="font-semibold">Last 5 to save availability</p>
                    {lastFiveEditors.map((e, i) => (
                      <p key={`${e.name}-${i}`}>
                        {e.name} · {new Date(e.updated_at).toLocaleString()}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p>No one has saved their availability yet.</p>
                )}
                <div className="mt-2 space-y-0.5 border-t pt-2" data-testid="text-anonymous-visit-traffic">
                  <p className="font-semibold">Anonymous site visits</p>
                  <p>
                    {visitSinceLastSave === null ? "—" : visitSinceLastSave} since last save
                  </p>
                  <p>
                    {visitLast5Days === null ? "—" : visitLast5Days} in the last 5 days
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
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

/** Dark teal-green (100%) → medium green (75-89%) → light yellow-green (43-56%) → tan/beige (low%) heatmap fill scale. */
function heatmapCellColor(pct: number): { bg: string; fg: string } {
  const stops: [number, string, string][] = [
    [0, "hsl(35 32% 80%)", "hsl(35 45% 25%)"],
    [43, "hsl(76 42% 62%)", "hsl(90 40% 18%)"],
    [57, "hsl(100 40% 52%)", "white"],
    [75, "hsl(140 42% 40%)", "white"],
    [90, "hsl(174 55% 28%)", "white"],
    [100, "hsl(174 60% 20%)", "white"],
  ];
  const clamped = Math.min(Math.max(pct, 0), 100);
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i][0] && clamped <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  return { bg: clamped <= lo[0] + (hi[0] - lo[0]) / 2 ? lo[1] : hi[1], fg: clamped <= lo[0] + (hi[0] - lo[0]) / 2 ? lo[2] : hi[2] };
}

function AvailabilityHeatmap({
  people,
  activities,
  onBackToAvailability,
}: {
  people: Person[];
  activities: Activity[];
  onBackToAvailability: () => void;
}) {
  const rows = useMemo(
    () =>
      DAYS.map((day) => ({
        day,
        cells: PERIODS.map((period) => {
          const locked = isYachtLockSlot(day.iso, period);
          const tally = tallyWindow(people, day.iso, period);
          const detailed = tallyWindowDetailed(people, day.iso, period, activities);
          const inTown = people.length - tally.out.length;
          const pct = inTown > 0 ? Math.round((tally.ok.length / inTown) * 100) : 0;
          return { period, tally, detailed, inTown, pct, locked };
        }),
      })),
    [people, activities],
  );

  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">No responses yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-0 table-fixed border-separate border-spacing-y-1.5 text-xs sm:min-w-[560px]" data-testid="heatmap-grid">
          <colgroup>
            <col className="w-12 sm:w-20" />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th className="text-left text-muted-foreground">Day</th>
              {PERIODS.map((p) => (
                <th key={p} className="px-0.5 text-left font-semibold text-foreground sm:px-1">
                  <span className="sm:hidden">{PERIOD_SHORT_LABEL[p]}</span>
                  <span className="hidden sm:inline">{PERIOD_LABEL[p]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ day, cells }) => (
              <tr key={day.iso}>
                <td className="whitespace-nowrap py-1 pr-1 text-right align-middle font-medium text-muted-foreground sm:pr-3">
                  <div className="leading-tight">
                    <div>{day.weekday}</div>
                    <div className="text-[10px] text-muted-foreground/80">{day.iso.slice(5, 7)}/{day.iso.slice(8, 10)}</div>
                  </div>
                </td>
                {cells.map(({ period, tally, detailed, inTown, pct, locked }) => {
                  if (locked) {
                    return (
                      <td key={period} className="px-0.5 py-1 sm:px-1">
                        <div
                          className="h-9 w-full rounded-sm border border-white/15 bg-[hsl(220_10%_10%)] sm:h-10"
                          data-testid={`heatmap-cell-${day.iso}-${period}`}
                          title="Yacht Club 87 Dinner/Dance — everyone's there. $50pp / $40 plus-one, Zelle 813-966-8151 (or text to request a mailing address)."
                        />
                      </td>
                    );
                  }
                  const { bg, fg } = heatmapCellColor(pct);
                  return (
                    <td key={period} className="px-0.5 py-1 sm:px-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="h-9 w-full rounded-sm text-[9px] font-bold sm:h-10 sm:text-[11px]"
                            style={{ backgroundColor: bg, color: fg }}
                            data-testid={`heatmap-cell-${day.iso}-${period}`}
                          >
                            <span className="sm:hidden">{inTown > 0 ? `${pct}%` : "—"}</span>
                            <span className="hidden sm:inline">{inTown > 0 ? `${tally.ok.length}/${inTown} \u00b7 ${pct}%` : "—"}</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-sm">
                          <p className="font-medium">{day.label} · {PERIOD_LABEL[period]}</p>
                          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                            <p>{detailed.ok.length} available{detailed.ok.length > 0 ? `: ${detailed.ok.join(", ")}` : ""}</p>
                            <p>{detailed.maybe.length} possibly{detailed.maybe.length > 0 ? `: ${detailed.maybe.join(", ")}` : ""}</p>
                            <p>
                              {detailed.busy.length} busy
                              {detailed.busy.length > 0
                                ? `: ${detailed.busy.map((b) => `${b.name} (${b.label})`).join(", ")}`
                                : ""}
                            </p>
                            <p>{detailed.private.length} private{detailed.private.length > 0 ? `: ${detailed.private.join(", ")}` : ""}</p>
                            <p>{detailed.out.length} out of town{detailed.out.length > 0 ? `: ${detailed.out.join(", ")}` : ""}</p>
                          </div>
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
          style={{ background: `linear-gradient(90deg, ${heatmapCellColor(0).bg}, ${heatmapCellColor(43).bg}, ${heatmapCellColor(75).bg}, ${heatmapCellColor(100).bg})` }}
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

function VolunteerLeadForm({
  activityId,
  myIdentity,
  onVolunteer,
}: {
  activityId: string;
  myIdentity: MyIdentity | null;
  onVolunteer: (lead: ClusterLead) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(false);

  async function submit() {
    if (!myIdentity) return;
    setSubmitting(true);
    try {
      await onVolunteer({ activity_id: activityId, lead_name: myIdentity.name, lead_email: myIdentity.email });
      setSelected(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!myIdentity) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`text-volunteer-signin-${activityId}`}>
        Fill out your name and email in My Availability to see more.
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

/** Editable-by-organizer link to the group's chat (e.g. WhatsApp). Everyone sees
 * it as a clickable link once set; only the cluster lead (or Maintenance mode)
 * gets the input to add or change it. */
function ChatLinkEditor({
  activityId,
  lead,
  canEdit,
  onSave,
}: {
  activityId: string;
  lead: ClusterLead;
  canEdit: boolean;
  onSave: (lead: ClusterLead) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(lead.chat_link ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(lead.chat_link ?? "");
  }, [lead.chat_link]);

  async function submit() {
    const trimmed = value.trim();
    const normalized = trimmed && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
    setSaving(true);
    try {
      await onSave({ ...lead, chat_link: normalized || null });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const linkNode = lead.chat_link ? (
    <Button
      asChild
      size="sm"
      className="gap-1.5 bg-[hsl(142_70%_32%)] text-white border-[hsl(142_70%_26%)] hover:bg-[hsl(142_70%_28%)]"
    >
      <a
        href={lead.chat_link}
        target="_blank"
        rel="noreferrer"
        data-testid={`link-chat-${activityId}`}
      >
        <MessageCircle className="size-4" />
        Join the group chat
      </a>
    </Button>
  ) : null;

  if (!canEdit) {
    return linkNode ? <p className="mt-1">{linkNode}</p> : null;
  }

  if (!editing) {
    return (
      <div className="mt-1 flex items-center gap-2">
        {linkNode ?? <span>No group chat link yet.</span>}
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 text-xs underline underline-offset-2"
          onClick={() => setEditing(true)}
          data-testid={`button-edit-chat-link-${activityId}`}
        >
          {lead.chat_link ? "Edit link" : "Add link"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2" data-testid={`chat-link-editor-${activityId}`}>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://chat.whatsapp.com/…"
        className="h-8 max-w-xs text-sm"
        data-testid={`input-chat-link-${activityId}`}
      />
      <Button size="sm" onClick={submit} disabled={saving} data-testid={`button-save-chat-link-${activityId}`}>
        Save
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setEditing(false);
          setValue(lead.chat_link ?? "");
        }}
        data-testid={`button-cancel-chat-link-${activityId}`}
      >
        Cancel
      </Button>
    </div>
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
    <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2" data-testid={`event-plan-editor-${activityId}`}>
      <div className="space-y-1">
        <Label htmlFor={`input-plan-venue-${activityId}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Venue</Label>
        <Input id={`input-plan-venue-${activityId}`} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Venue" data-testid={`input-plan-venue-${activityId}`} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`input-plan-date-${activityId}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</Label>
        <Input id={`input-plan-date-${activityId}`} type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} data-testid={`input-plan-date-${activityId}`} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`input-plan-time-${activityId}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</Label>
        <div className="relative">
          <Clock className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`input-plan-time-${activityId}`}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="e.g. 11:30am"
            className="pl-8"
            data-testid={`input-plan-time-${activityId}`}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`input-plan-maxsize-${activityId}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max group size</Label>
        <Input id={`input-plan-maxsize-${activityId}`} type="number" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} placeholder="Max size" data-testid={`input-plan-maxsize-${activityId}`} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`select-plan-status-${activityId}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as EventPlanStatus)}>
          <SelectTrigger id={`select-plan-status-${activityId}`} data-testid={`select-plan-status-${activityId}`}>
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
      </div>
      <Button size="sm" onClick={submit} className="sm:col-span-2" data-testid={`button-save-plan-${activityId}`}>
        Save plan
      </Button>
    </div>
  );
}

interface InterestCurtainProps {
  pillCounts: { id: string; label: string; count: number }[];
  activeFilter: string | null;
  onSelect: (id: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showPills: boolean;
}

/** Left-edge "Interests" curtain filter — hover-open on desktop, button-triggered on mobile. Instantly re-scopes the heatmap, best days and roster. */
function InterestCurtain({ pillCounts, activeFilter, onSelect, open, onOpenChange, showPills }: InterestCurtainProps) {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  if (!showPills) return null;

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => onOpenChange(false), 250);
  }
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  return (
    <>
      {/* Desktop hover zone along the left edge of the viewport */}
      <div
        className="fixed left-0 top-0 z-40 hidden h-full w-4 md:block"
        onMouseEnter={() => {
          cancelClose();
          onOpenChange(true);
        }}
        data-testid="curtain-hover-zone"
      />

      {open && (
        <div
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-xl"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          data-testid="curtain-panel"
        >
          <div className="flex items-center justify-between border-b p-4">
            <h3 className="font-semibold">Interests</h3>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={() => onOpenChange(false)} data-testid="button-curtain-close">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Toggle a filter — the heatmap, best days and roster update instantly.
            </p>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={cn(
                "block w-full rounded-full px-3 py-1.5 text-left text-sm font-medium transition-colors",
                activeFilter === null ? "bg-foreground text-background" : "hover-elevate active-elevate-2 border",
              )}
              data-testid="pill-everyone"
            >
              Everyone
            </button>
            {pillCounts.map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => onSelect(pill.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-full px-3 py-1.5 text-left text-sm font-medium transition-colors",
                  activeFilter === pill.id ? "bg-foreground text-background" : "hover-elevate active-elevate-2 border",
                )}
                data-testid={`pill-${pill.id}`}
              >
                <span>{pill.label}</span>
                {pill.count > 0 && (
                  <span className={cn("ml-2 text-xs font-bold", activeFilter === pill.id ? "text-background" : "text-destructive")}>
                    {pill.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
