import { useEffect, useMemo, useRef, useState } from "react";
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
import { CalendarRange, CheckCircle2, Lock, LogIn, Sparkles, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import VolunteerPromptDialog from "@/components/volunteer-prompt-dialog";
import YachtPaymentDialog from "@/components/yacht-payment-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  type Activity,
  type EventPlan,
  type MyIdentity,
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
  arriveOptions,
  departOptions,
  eventsForDate,
  writeMyIdentity,
  groupPlannedEventsForDate,
  initSlots,
  isGroupPlannedId,
  isYachtLockSlot,
  labelForTag,
  eventCategoryClass,
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
  /** Needed to auto-prompt the Yacht Club payment reminder right after a fresh save. */
  people?: Person[];
  isDemo?: boolean;
  sessionEmail?: string | null;
  onSendSignInLink?: (email: string) => Promise<void>;
  onConfirmYachtPaid?: (paid: boolean) => Promise<void>;
  /** Name+email remembered on this device from a prior submission, independent of sign-in. */
  myIdentity?: MyIdentity | null;
  onSignOut?: () => void;
  /** Set when a magic-link redirect failed to verify on page load. */
  linkError?: string | null;
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

export default function EntryForm({ initial, activities, eventPlans, onSave, onSuggestActivity, onGoToDashboard, people, isDemo, sessionEmail, onSendSignInLink, onConfirmYachtPaid, myIdentity, onSignOut, linkError }: EntryFormProps) {
  const { toast } = useToast();
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

  // --- Returning-user sign-in & repopulation -------------------------------
  // Signed in for real: a magic-link click resolved to a live Supabase Auth
  // session AND that session's email matches a saved entry (`initial`).
  const signedIn = Boolean(sessionEmail && initial);
  const hydratedRef = useRef<string | null>(null);

  // Once a signed-in session resolves to the caller's saved row, hydrate the
  // form fields from it (fields render blank/default until then since the
  // session + people list load asynchronously after mount).
  useEffect(() => {
    if (!initial) return;
    const key = `${initial.name}|${initial.email ?? ""}`;
    if (hydratedRef.current === key) return;
    hydratedRef.current = key;
    setName(initial.name ?? "");
    setEmail(initial.email ?? "");
    setArrival(initial.arrival ?? START_DATE);
    setDeparture(initial.departure ?? END_DATE);
    setSlots(initial.slots ?? initSlots(initial.arrival ?? START_DATE, initial.departure ?? END_DATE));
    setInterests(initial.interests ?? []);
    setAttending(initial.attending ?? null);
    setVolunteerSupport(initial.volunteer_support ?? null);
    setVolunteerLead(initial.volunteer_lead ?? null);
    setVolunteerPrompted((initial.interests ?? []).length > 0);
  }, [initial]);

  // Not signed in, but the name typed matches someone who already has a saved
  // entry (by name or by email) — their entry is protected: we load it for
  // review but block saving until they verify via the emailed sign-in link.
  const matchedExisting = useMemo(() => {
    if (signedIn || !people) return null;
    const typedName = name.trim().toLowerCase();
    const typedEmail = email.trim().toLowerCase();
    return (
      people.find(
        (p) =>
          (typedName && p.name.trim().toLowerCase() === typedName) ||
          (typedEmail && (p.email ?? "").trim().toLowerCase() === typedEmail),
      ) ?? null
    );
  }, [people, name, email, signedIn]);

  const matchedHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!matchedExisting) {
      matchedHydratedRef.current = null;
      return;
    }
    const key = `${matchedExisting.name}|${matchedExisting.email ?? ""}`;
    if (matchedHydratedRef.current === key) return;
    matchedHydratedRef.current = key;
    if (!email.trim() && matchedExisting.email) setEmail(matchedExisting.email);
    setArrival(matchedExisting.arrival ?? START_DATE);
    setDeparture(matchedExisting.departure ?? END_DATE);
    setSlots(matchedExisting.slots ?? initSlots(matchedExisting.arrival ?? START_DATE, matchedExisting.departure ?? END_DATE));
    setInterests(matchedExisting.interests ?? []);
    setAttending(matchedExisting.attending ?? null);
    setVolunteerSupport(matchedExisting.volunteer_support ?? null);
    setVolunteerLead(matchedExisting.volunteer_lead ?? null);
    setVolunteerPrompted((matchedExisting.interests ?? []).length > 0);
  }, [matchedExisting]);

  const isProtected = Boolean(matchedExisting) && !signedIn;

  const [linkSending, setLinkSending] = useState(false);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [linkSendError, setLinkSendError] = useState<string | null>(null);

  async function handleSendSignInLink() {
    const target = (matchedExisting?.email ?? email).trim();
    if (!target || !EMAIL_PATTERN.test(target) || !onSendSignInLink) return;
    setLinkSending(true);
    setLinkSendError(null);
    try {
      await onSendSignInLink(target);
      setLinkSentTo(target);
    } catch {
      setLinkSendError("Couldn't send the email right now — please try again.");
    } finally {
      setLinkSending(false);
    }
  }

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

  /** Selecting a specific sub-event: applies it to every period the event spans that same day
   * (e.g. an all-morning-and-afternoon tour), and lets the person know via a toast so a single
   * click covers the whole event instead of requiring two separate slot edits. */
  function selectEvent(iso: string, period: Period, event: { id: string; label: string; autoSlots?: Period[] }) {
    const span = event.autoSlots && event.autoSlots.includes(period) ? event.autoSlots : [period];
    setSlots((prev) => {
      const next = { ...prev, [iso]: { ...prev[iso] } };
      for (const p of span) {
        if (isYachtLockSlot(iso, p)) continue;
        next[iso][p] = { s: "busy" as SlotStatus, t: event.id };
      }
      return next;
    });
    if (span.length > 1) {
      const day = DAYS.find((d) => d.iso === iso);
      const dayLabel = day?.label ?? iso;
      const spanPhrase =
        span.length === 3 ? "all day" : span.map((p) => PERIOD_LABEL[p].toLowerCase()).join(" & ");
      const markedPhrase = span.length === 3 ? "morning, afternoon and evening are marked for you" : `${spanPhrase} are marked for you`;
      toast({
        title: "Time slots marked",
        description: `${event.label} runs ${dayLabel} ${spanPhrase} \u2014 ${markedPhrase}.`,
      });
    }
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
    if (isProtected) {
      setValidationError(
        "This entry is protected. If it's yours, enter your name and use the sign-in link we email you above.",
      );
      return;
    }
    if (arrival > departure) {
      setValidationError("Your arrival date must be before your departure date.");
      return;
    }
    if (attending === null) {
      setValidationError("Please choose Count me in or Not sure yet in the Ticket-check section below.");
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
      writeMyIdentity({ name: name.trim(), email: email.trim() });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    const savedEmail = email.trim().toLowerCase();
    const myPersonRow = savedEmail
      ? people?.find((p) => (p.email ?? "").trim().toLowerCase() === savedEmail) ?? null
      : null;
    const alreadyPaidYacht = Boolean(myPersonRow?.yacht_paid);
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
          {onSendSignInLink && onConfirmYachtPaid && (
            <YachtPaymentDialog
              isDemo={Boolean(isDemo)}
              sessionEmail={sessionEmail ?? null}
              myPerson={myPersonRow}
              onSendSignInLink={onSendSignInLink}
              onConfirmPaid={onConfirmYachtPaid}
              autoOpen={!alreadyPaidYacht}
              defaultEmail={email}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" data-testid="form-entry">
      <VolunteerPromptDialog step={volunteerStep} onAnswer={handleVolunteerAnswer} />

      {(signedIn || isProtected) && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm" data-testid="text-welcome-back">
          {signedIn ? (
            <>
              Welcome back, <strong>{(initial?.name ?? name).split(" ")[0]}</strong> — you're signed in, so you can
              update anything and save.
            </>
          ) : (
            <>
              Welcome back, <strong>{(matchedExisting?.name ?? name).split(" ")[0]}</strong> — your saved entry is
              loaded for you to review. To make changes, use the "Email me my sign-in link" button below, then open
              the link we send you.
            </>
          )}
        </p>
      )}

      {linkError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" data-testid="text-link-error">
          {linkError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Morgan" data-testid="input-name" required />
            <p className="text-sm text-muted-foreground">First and last name so the group knows which entry is yours.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-email" required />
            <p className="text-sm text-muted-foreground">Required. We'll email you a private link to view and update your entry whenever you return.</p>
          </div>

          {isProtected && (
            <p className="text-sm text-destructive" data-testid="text-protected-entry">
              This entry is protected. If it's yours, use the sign-in link we email you below.
            </p>
          )}

          {onSendSignInLink && (signedIn || isProtected) && (
            <div className="space-y-1 border-t pt-3">
              {!signedIn && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={linkSending}
                  onClick={handleSendSignInLink}
                  data-testid="button-send-sign-in-link"
                >
                  <LogIn className="mr-1.5 h-3.5 w-3.5" />
                  {linkSending ? "Sending\u2026" : "Email me my sign-in link"}
                </Button>
              )}
              {linkSentTo && (
                <p className="text-sm font-medium text-primary" data-testid="text-link-sent">
                  Check your inbox — we sent a sign-in link to {linkSentTo}.
                </p>
              )}
              {linkSendError && (
                <p className="text-sm text-destructive" data-testid="text-link-send-error">
                  {linkSendError}
                </p>
              )}
              {signedIn && onSignOut && (
                <Button type="button" size="sm" variant="outline" onClick={onSignOut} data-testid="button-sign-out">
                  Sign out
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" /> When are you in the area?
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            You'll only mark the days you're here — We track Jan 9–30 - this includes CZR events and the shoulder
            days before and after; earlier arrivals and later departures count from the 9th / through the 30th.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="arrival">Arrive</Label>
            <Select value={arrival} onValueChange={(value) => updateRange(value, value > departure ? value : departure)}>
              <SelectTrigger id="arrival" data-testid="input-arrival">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {arriveOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} disabled={opt.value > departure}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="departure">Depart</Label>
            <Select value={departure} onValueChange={(value) => updateRange(value < arrival ? value : arrival, value)}>
              <SelectTrigger id="departure" data-testid="input-departure">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} disabled={opt.value < arrival}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="text-sm text-muted-foreground space-y-1.5">
            <p>
              Everything starts as <span className="font-medium text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]">Available</span>.{" "}
              <span className="underline underline-offset-2">
                Change any slot where you already have plans — choose <strong className="font-bold">MiEvento</strong> and pick from what's scheduled that day.
              </span>{" "}
              The <em>Yacht Club 87 Dinner/Dance</em> on Wed 20 evening is already set for everyone.
            </p>
            <p className="italic text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]">
              Go through each block — a blank canvas of green reads as "free and ready to join," and the organizers
              will plan accordingly.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
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
                      const statusOptions = statusesForSlot(day.iso, period, current.s);
                      const options = [
                        ...eventsForDate(day.iso, period).map((e) => ({ id: e.id, label: e.label, note: e.note, autoSlots: e.autoSlots })),
                        ...groupPlannedEventsForDate(day.iso, eventPlans, activities, period),
                      ];
                      return (
                        <td key={period} className="px-3 py-3">
                          {locked ? (
                            <div
                              className={cn("flex items-start gap-1 rounded-md border px-3 py-2 text-sm text-muted-foreground", "bg-muted")}
                              data-testid={`slot-locked-${day.iso}-${period}`}
                            >
                              <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                              <span>Yacht Club 87 Dinner/Dance</span>
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
                              {current.s === "busy" && (current.t && isGroupPlannedId(current.t)
                                ? <p className={cn("rounded-md px-2 py-1 text-xs", STATUS_COLOR.busy)}>{labelForTag(current.t, activities)}</p>
                                : options.length > 0 && (() => {
                                  const category = current.t ? eventCategoryClass(current.t) : undefined;
                                  return (
                                    <Select
                                      value={current.t ?? ""}
                                      onValueChange={(value) => {
                                        const event = options.find((o) => o.id === value);
                                        if (event) selectEvent(day.iso, period, event);
                                      }}
                                    >
                                      <SelectTrigger
                                        className={cn(
                                          "h-8 text-xs",
                                          current.t ? cn("border-border/60 bg-card", category) : "tag-unanswered",
                                        )}
                                        data-testid={`select-event-${day.iso}-${period}`}
                                      >
                                        <SelectValue placeholder="Which event?" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {options.map((o) => (
                                          <SelectItem key={o.id} value={o.id} className={eventCategoryClass(o.id)}>
                                            {o.note ? `${o.label} (${o.note})` : o.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  );
                                })())}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" /> Ticket-check <span className="text-xs font-normal text-destructive">(required)</span>
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
