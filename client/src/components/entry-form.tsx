import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarRange, CheckCircle2, Sparkles, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import VolunteerPromptDialog from "@/components/volunteer-prompt-dialog";
import {
  type Activity,
  type EventPlan,
  type Period,
  type Person,
  type SlotStatus,
  BASE_ACTIVITIES,
  DAYS,
  EMAIL_PATTERN,
  END_DATE,
  PERIODS,
  PERIOD_LABEL,
  START_DATE,
  STATUS_LABEL,
  STATUS_SHORT,
  eventsForDate,
  groupPlannedEventsForDate,
  initSlots,
  isYachtLockSlot,
  labelForTag,
  mieventoOrEventLabel,
  statusesForSlot,
} from "@/lib/reunion";

interface EntryFormProps {
  initial?: Person | null;
  activities: Activity[];
  eventPlans: EventPlan[];
  onSave: (person: Person) => Promise<void>;
  onSuggestActivity: (id: string, label: string, suggestedBy: string) => Promise<void>;
  onGoToDashboard?: () => void;
}

function toMDY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

const STATUS_COLOR: Record<SlotStatus, string> = {
  ok: "status-ok",
  maybe: "status-maybe",
  busy: "status-busy",
  private: "status-private",
  "pool-day": "status-pool",
};

const LEGEND_ITEMS: { status: SlotStatus; label: string; hint: string }[] = [
  { status: "ok", label: "Available", hint: "Open — plan around me" },
  { status: "maybe", label: "Maybe", hint: "Possibly available" },
  { status: "busy", label: "MiEvento", hint: "MiEvento — existing event (Jan 17–24)" },
  { status: "busy", label: "Event/Activity", hint: "Event/Activity (Jan 9–16, 25–30)" },
  { status: "private", label: "Private", hint: "Private / unavailable" },
];

export default function EntryForm({ initial, activities, eventPlans, onSave, onSuggestActivity, onGoToDashboard }: EntryFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [arrival, setArrival] = useState(initial?.arrival ?? START_DATE);
  const [departure, setDeparture] = useState(initial?.departure ?? END_DATE);
  const [slots, setSlots] = useState(initial?.slots ?? initSlots(START_DATE, END_DATE));
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [newActivityLabel, setNewActivityLabel] = useState("");
  const [attending, setAttending] = useState<boolean | null>(initial?.attending ?? null);
  const [volunteerSupport, setVolunteerSupport] = useState<boolean | null>(initial?.volunteer_support ?? null);
  const [volunteerLead, setVolunteerLead] = useState<boolean | null>(initial?.volunteer_lead ?? null);
  const [volunteerStep, setVolunteerStep] = useState<"support" | "lead" | null>(null);
  const [volunteerPrompted, setVolunteerPrompted] = useState(interests.length > 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const days = useMemo(() => DAYS.filter((d) => d.iso >= arrival && d.iso <= departure), [arrival, departure]);

  function updateRange(nextArrival: string, nextDeparture: string) {
    setArrival(nextArrival);
    setDeparture(nextDeparture);
    setSlots((prev) => {
      const fresh = initSlots(nextArrival, nextDeparture);
      // Preserve any answers already given for days still in range.
      for (const iso of Object.keys(fresh)) {
        if (prev[iso]) fresh[iso] = { ...fresh[iso], ...prev[iso] };
      }
      return fresh;
    });
  }

  function setSlotStatus(iso: string, period: Period, status: SlotStatus, tag?: string) {
    if (isYachtLockSlot(iso, period)) return; // locked, cannot be edited
    setSlots((prev) => ({
      ...prev,
      [iso]: { ...prev[iso], [period]: status === "busy" ? { s: status, t: tag } : { s: status } },
    }));
  }

  function toggleInterest(id: string) {
    if (!volunteerPrompted) {
      setVolunteerPrompted(true);
      setVolunteerStep("support");
    }
    setInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  function handleVolunteerAnswer(yes: boolean) {
    if (volunteerStep === "support") {
      setVolunteerSupport(yes);
      setVolunteerStep("lead");
    } else if (volunteerStep === "lead") {
      setVolunteerLead(yes);
      setVolunteerStep(null);
    }
  }

  async function handleSuggestActivity() {
    const label = newActivityLabel.trim();
    if (!label) return;
    const id = slugify(label);
    await onSuggestActivity(id, label, name.trim() || "someone");
    setInterests((prev) => [...prev, id]);
    setNewActivityLabel("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    if (!name.trim()) {
      setValidationError("Please enter your name.");
      return;
    }
    if (!email.trim() || !EMAIL_PATTERN.test(email.trim())) {
      setValidationError("Please enter a valid email address — we'll send you a private link to your entry.");
      return;
    }
    if (arrival > departure) {
      setValidationError("Your arrival date must be before your departure date.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        email: email.trim(),
        arrival,
        departure,
        slots,
        interests,
        attending,
        volunteer_support: volunteerSupport,
        volunteer_lead: volunteerLead,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <Card className="max-w-xl mx-auto" data-testid="card-confirmation">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-14 w-14 text-primary" />
          <div>
            <h2 className="text-2xl font-semibold">Thanks, {name.split(" ")[0]}!</h2>
            <p className="mt-2 text-muted-foreground">
              Your availability from {arrival} to {departure} is saved. You picked{" "}
              {interests.length} interest{interests.length === 1 ? "" : "s"} — check the group dashboard
              any time to see how everyone's schedules line up.
            </p>
          </div>
          <Button variant="outline" onClick={() => setSaved(false)} data-testid="button-edit-again">
            Make changes
          </Button>
          {onGoToDashboard && (
            <button
              type="button"
              onClick={onGoToDashboard}
              className="text-sm font-medium text-primary underline underline-offset-2"
              data-testid="link-go-to-dashboard-confirmed"
            >
              Click here for Group Dashboard
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" data-testid="form-entry">
      <VolunteerPromptDialog step={volunteerStep} onAnswer={handleVolunteerAnswer} />

      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
          <p className="text-sm text-muted-foreground">
            First and last name so the group knows which entry is yours, plus your email so we can send you a
            private link to view and update it whenever you return.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Morgan" data-testid="input-name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-email" required />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" /> When are you in the area?
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            You'll only mark the days you're here — everyone else is handled automatically. We track Jan 9–30;
            earlier arrivals and later departures count from the 9th / through the 30th.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="arrival">Arrive</Label>
            <Input
              id="arrival"
              type="date"
              min={START_DATE}
              max={departure}
              value={arrival}
              onChange={(e) => updateRange(e.target.value, departure)}
              data-testid="input-arrival"
            />
            <p className="text-xs text-muted-foreground" data-testid="text-arrival-phrase">
              {toMDY(arrival)} or earlier
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="departure">Depart</Label>
            <Input
              id="departure"
              type="date"
              min={arrival}
              max={END_DATE}
              value={departure}
              onChange={(e) => updateRange(arrival, e.target.value)}
              data-testid="input-departure"
            />
            <p className="text-xs text-muted-foreground" data-testid="text-departure-phrase">
              {toMDY(departure)} or later
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What are you up for?</CardTitle>
          <p className="text-sm text-muted-foreground">
            (BHS87-only activities) — pick any of the interest pills you'd like the class of '87 to organize.
            MiEvento events are covered in the time slots below (Jan 17–24). Pills are just interest — you'll
            confirm you're in with the Ticket-check after your time slots.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[...BASE_ACTIVITIES, ...activities.filter((a) => !BASE_ACTIVITIES.some((b) => b.id === a.id))].map((activity) => {
              const active = interests.includes(activity.id);
              return (
                <button
                  type="button"
                  key={activity.id}
                  onClick={() => toggleInterest(activity.id)}
                  data-testid={`pill-interest-${activity.id}`}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors hover-elevate active-elevate-2",
                    active ? "bg-primary text-primary-foreground border-primary-border" : "bg-secondary text-secondary-foreground border-secondary-border",
                  )}
                >
                  {activity.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="flex-1 min-w-[220px] space-y-2">
              <Label htmlFor="new-activity">Suggest another activity…</Label>
              <Input
                id="new-activity"
                value={newActivityLabel}
                onChange={(e) => setNewActivityLabel(e.target.value)}
                placeholder="Suggest an activity"
                data-testid="input-suggest-activity"
              />
            </div>
            <Button type="button" variant="secondary" onClick={handleSuggestActivity} data-testid="button-suggest-activity">
              <Sparkles className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mark your time slots</CardTitle>
          <p className="text-sm text-muted-foreground">
            Everything starts as <strong>Available</strong>. Change any slot where you already have plans — choose{" "}
            <strong>MiEvento</strong> and pick from what's scheduled that day. The <em>Yacht Club 87 Dinner/Dance</em>{" "}
            on Wed 20 evening is already set for everyone.
          </p>
          <p className="text-sm italic text-muted-foreground">
            Go through each block — a blank canvas of green reads as "free and ready to join," and the organizers
            will plan accordingly.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[640px] border-collapse text-sm" data-testid="table-time-slots">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Day</th>
                  {PERIODS.map((period) => (
                    <th key={period} className="px-3 py-2">{PERIOD_LABEL[period]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.iso} className="border-b align-top last:border-0" data-testid={`row-day-${day.iso}`}>
                    <td className="whitespace-nowrap px-3 py-3 font-medium">{day.label}</td>
                    {PERIODS.map((period) => {
                      const locked = isYachtLockSlot(day.iso, period);
                      const current = slots[day.iso]?.[period] ?? { s: "ok" as SlotStatus };
                      const statusOptions = statusesForSlot(day.iso, period);
                      const options = [
                        ...eventsForDate(day.iso).map((e) => ({ id: e.id, label: e.label })),
                        ...groupPlannedEventsForDate(day.iso, eventPlans, activities),
                      ];
                      return (
                        <td key={period} className="px-3 py-3">
                          {locked ? (
                            <div className={cn("rounded-md border px-3 py-2 text-sm text-muted-foreground", "bg-muted")} data-testid={`slot-locked-${day.iso}-${period}`}>
                              Yacht Club 87 Dinner/Dance
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Select
                                value={current.s}
                                onValueChange={(value) => setSlotStatus(day.iso, period, value as SlotStatus, current.t)}
                              >
                                <SelectTrigger className={cn("h-9", STATUS_COLOR[current.s])} data-testid={`select-status-${day.iso}-${period}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {statusOptions.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s === "busy" ? mieventoOrEventLabel(day.iso) : STATUS_SHORT[s]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {current.s === "busy" && (current.t
                                ? <p className={cn("rounded-md px-2 py-1 text-xs", STATUS_COLOR.busy)}>{labelForTag(current.t, activities)}</p>
                                : options.length > 0 && (
                                  <Select
                                    value=""
                                    onValueChange={(value) => setSlotStatus(day.iso, period, "busy", value)}
                                  >
                                    <SelectTrigger className={cn("h-8 border-destructive/50 text-xs text-destructive")} data-testid={`select-event-${day.iso}-${period}`}>
                                      <SelectValue placeholder="Which event?" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {options.map((o) => (
                                        <SelectItem key={o.id} value={o.id}>
                                          {o.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3 rounded-md border bg-muted/40 p-3 text-xs" data-testid="slot-legend">
            {LEGEND_ITEMS.map((item, i) => (
              <span key={`${item.status}-${i}`} className="flex items-center gap-1.5">
                <span className={cn("inline-block h-3 w-3 rounded-sm", STATUS_COLOR[item.status])} />
                <span title={item.hint}>{item.label}</span>
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className={cn("inline-block h-3 w-3 rounded-sm", STATUS_COLOR["pool-day"])} />
              <span title={STATUS_LABEL["pool-day"]}>{STATUS_LABEL["pool-day"]}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" /> Ticket-check
          </CardTitle>
          <p className="text-sm text-muted-foreground">Interest pills are just interest — this is the "I want in" confirmation.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAttending(true)}
            data-testid="button-attending-yes"
            className={cn(
              "rounded-md border p-4 text-left transition-colors hover-elevate active-elevate-2",
              attending === true ? "border-primary bg-primary/10" : "border-card-border",
            )}
          >
            <p className="font-medium">Count me in</p>
            <p className="mt-1 text-xs text-muted-foreground">
              I plan to attend the Reunion, I have paid for the Yacht Club BHS87 event, and I have paid or currently
              in the process of registering/paying for MiEvento tickets, so I definitely want the interest groups
              to plan around my scheduled events.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setAttending(false)}
            data-testid="button-attending-not-sure"
            className={cn(
              "rounded-md border p-4 text-left transition-colors hover-elevate active-elevate-2",
              attending === false ? "border-primary bg-primary/10" : "border-card-border",
            )}
          >
            <p className="font-medium">Not sure yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              I have not registered for any MiEvento event yet, not sure what I will be doing, I plan to be there,
              so keep me posted — I will confirm when I can.
            </p>
          </button>
        </CardContent>
      </Card>

      {validationError && (
        <p className="text-sm text-destructive" role="alert" data-testid="text-validation-error">
          {validationError}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Badge variant="secondary">{interests.length} interests selected</Badge>
        <Button type="submit" disabled={saving} data-testid="button-save-availability">
          {saving ? "Saving…" : "Save my Info"}
        </Button>
      </div>

      {onGoToDashboard && (
        <p className="pt-2 text-center text-sm">
          Want to know what others are doing?{" "}
          <button
            type="button"
            onClick={onGoToDashboard}
            className="font-medium text-primary underline underline-offset-2"
            data-testid="link-go-to-dashboard"
          >
            Click here for Group Dashboard
          </button>
        </p>
      )}
    </form>
  );
}
