import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Info, Settings, Download, ShieldCheck, Anchor, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Activity,
  type ClusterLead,
  type ClusterResource,
  type EventPlan,
  type EventPlanStatus,
  type Person,
  CLUSTER_RESOURCE_LINKS,
  EVENT_PLAN_STATUS_LABEL,
  MAINTENANCE_PIN,
  PERIOD_LABEL,
  STATUS_LABEL,
  bestWindows,
  clusterSummaries,
  exportAvailabilityCsv,
  formatDateRange,
} from "@/lib/reunion";

interface DashboardProps {
  people: Person[];
  activities: Activity[];
  clusterResources: ClusterResource[];
  clusterLeads: ClusterLead[];
  eventPlans: EventPlan[];
  isDemo: boolean;
  sessionEmail: string | null;
  onSuggestResource: (resource: ClusterResource) => Promise<void>;
  onVolunteerLead: (lead: ClusterLead) => Promise<void>;
  onSaveEventPlan: (plan: EventPlan) => Promise<void>;
}

function useMaintenanceUnlock() {
  const [unlocked, setUnlocked] = useState(false);
  return { unlocked, setUnlocked };
}

export default function Dashboard({
  people,
  activities,
  clusterResources,
  clusterLeads,
  eventPlans,
  isDemo,
  sessionEmail,
  onSuggestResource,
  onVolunteerLead,
  onSaveEventPlan,
}: DashboardProps) {
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const { unlocked, setUnlocked } = useMaintenanceUnlock();
  const [showPills, setShowPills] = useState(true);

  const windows = useMemo(() => bestWindows(people, 5), [people]);
  const clusters = useMemo(() => clusterSummaries(people, activities), [people, activities]);

  function submitPin() {
    if (pinInput === MAINTENANCE_PIN) {
      setUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  return (
    <div className="space-y-8" data-testid="view-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Group dashboard</h2>
          {isDemo && <Badge variant="secondary" className="mt-1">Showing demo data</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportAvailabilityCsv(people, activities)} data-testid="button-export">
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Settings" data-testid="button-settings">
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="toggle-pills">Interest pills</Label>
                <Switch id="toggle-pills" checked={showPills} onCheckedChange={setShowPills} data-testid="settings-pills-switch" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="toggle-maintenance">Maintenance</Label>
                {unlocked ? (
                  <Switch id="toggle-maintenance" checked={unlocked} onCheckedChange={setUnlocked} data-testid="settings-maintenance-switch" />
                ) : (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-open-maintenance-pin">
                        Unlock
                      </Button>
                    </DialogTrigger>
                    <DialogContent data-testid="maintenance-pin-dialog">
                      <DialogHeader>
                        <DialogTitle>Enter maintenance PIN</DialogTitle>
                      </DialogHeader>
                      <div className="flex flex-col items-center gap-3 py-2">
                        <InputOTP maxLength={4} value={pinInput} onChange={setPinInput} data-testid="maintenance-pin-input">
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                          </InputOTPGroup>
                        </InputOTP>
                        {pinError && (
                          <p className="text-sm text-destructive" data-testid="maintenance-pin-error">
                            Incorrect PIN.
                          </p>
                        )}
                      </div>
                      <DialogFooter>
                        <Button onClick={submitPin} data-testid="maintenance-pin-submit">
                          Unlock
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Best windows for the group</CardTitle>
          <p className="text-sm text-muted-foreground">Day/period combinations where the most people are marked available.</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-5">
            {windows.map((w) => (
              <div key={`${w.iso}-${w.period}`} className="rounded-md border p-3 text-center" data-testid={`window-${w.iso}-${w.period}`}>
                <p className="text-sm font-medium">{w.day.short}</p>
                <p className="text-xs text-muted-foreground">{PERIOD_LABEL[w.period]}</p>
                <p className="mt-1 text-lg font-semibold text-primary">{w.available}/{w.total}</p>
              </div>
            ))}
            {windows.length === 0 && <p className="text-sm text-muted-foreground">No responses yet.</p>}
          </div>
        </CardContent>
      </Card>

      <RollCallCard people={people} />

      <Card>
        <CardHeader>
          <CardTitle>Interest clusters</CardTitle>
          <p className="text-sm text-muted-foreground">Who wants to do what, and who's organizing it.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {clusters.filter((c) => c.interestedCount > 0).map((cluster) => {
            const plan = eventPlans.find((p) => p.activity_id === cluster.activity.id);
            const lead = clusterLeads.find((l) => l.activity_id === cluster.activity.id);
            const resources = [
              ...(CLUSTER_RESOURCE_LINKS[cluster.activity.id] ?? []),
              ...clusterResources.filter((r) => r.activity_id === cluster.activity.id).map((r) => ({ label: r.label, url: r.url })),
            ];
            return (
              <div key={cluster.activity.id} className="rounded-md border p-4" data-testid={`cluster-${cluster.activity.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{cluster.activity.label}</span>
                    <Badge variant="secondary">{cluster.interestedCount} interested</Badge>
                    {cluster.tier !== "none" && <Badge>{cluster.tier}</Badge>}
                  </div>
                </div>

                {resources.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm">
                    {resources.map((r) => (
                      <li key={r.url}>
                        <a href={r.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                          {r.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 rounded-md bg-muted/50 p-3">
                  {plan ? (
                    <div className="text-sm">
                      <p className="font-medium">Group's plan — {EVENT_PLAN_STATUS_LABEL[plan.status]}</p>
                      <p className="text-muted-foreground">
                        {plan.event_date && formatDateRange(plan.event_date, plan.event_date)} {plan.start_time && `at ${plan.start_time}`}
                        {plan.venue && ` · ${plan.venue}`}
                        {typeof plan.max_size === "number" && ` · ${plan.max_size} spots`}
                      </p>
                      {lead && <p className="mt-1 text-muted-foreground">Event Organizer: {lead.lead_name}</p>}
                      {unlocked && (
                        <EventPlanEditor activityId={cluster.activity.id} initial={plan} onSave={onSaveEventPlan} sessionEmail={sessionEmail} />
                      )}
                    </div>
                  ) : lead ? (
                    <p className="text-sm text-muted-foreground">No plan yet — Event Organizer: {lead.lead_name}</p>
                  ) : (
                    <VolunteerLeadForm activityId={cluster.activity.id} onVolunteer={onVolunteerLead} />
                  )}
                </div>

                <SuggestResourceForm activityId={cluster.activity.id} onSuggest={onSuggestResource} />
              </div>
            );
          })}
          {clusters.every((c) => c.interestedCount === 0) && (
            <p className="text-sm text-muted-foreground">No interests marked yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who's in town when</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">In town</th>
                  <th className="py-2">Interests</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.name} className="border-b last:border-0" data-testid={`row-person-${p.name}`}>
                    <td className="py-2 pr-4 font-medium">{p.name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{formatDateRange(p.arrival, p.departure)}</td>
                    <td className="py-2 text-muted-foreground">{p.interests.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="pt-4 text-center text-sm text-muted-foreground">
        CZR BHS87 Reunion · Jan 9 – 30, 2027 · Mark once, meet more.
      </p>
    </div>
  );
}

function RollCallCard({ people }: { people: Person[] }) {
  const attending = people.filter((p) => p.attending === true);
  const notSure = people.filter((p) => p.attending === false);
  const unanswered = people.filter((p) => p.attending == null);
  const supportVolunteers = people.filter((p) => p.volunteer_support);
  const leadVolunteers = people.filter((p) => p.volunteer_lead);
  const yachtPaid = people.filter((p) => p.yacht_paid);

  return (
    <Card data-testid="card-roll-call">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" /> Roll call
        </CardTitle>
        <p className="text-sm text-muted-foreground">Who's confirmed, who's helping, and who's paid for the Yacht Club dinner.</p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
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
        </div>
      </CardContent>
    </Card>
  );
}

function VolunteerLeadForm({ activityId, onVolunteer }: { activityId: string; onVolunteer: (lead: ClusterLead) => Promise<void> }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onVolunteer({ activity_id: activityId, lead_name: name.trim() });
      setName("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[180px] space-y-1">
        <Label className="text-xs">Be the first to volunteer as Event Organizer</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" data-testid={`input-volunteer-lead-${activityId}`} />
      </div>
      <Button size="sm" variant="secondary" onClick={submit} disabled={submitting} data-testid={`button-volunteer-lead-${activityId}`}>
        <ShieldCheck className="mr-1 h-4 w-4" /> Volunteer
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
        <Button variant="ghost" size="sm" className="mt-2" data-testid={`button-suggest-resource-${activityId}`}>
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
