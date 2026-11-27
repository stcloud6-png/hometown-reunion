import { useEffect, useMemo, useRef, useState } from "react";
import { SlotTicketHint } from "@/components/ticket-watch";
import { ticketsForSlot, type TicketWatchRow } from "@/lib/ticket-watch";
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
import { CalendarRange, CheckCircle2, ExternalLink, Lock, LogIn, Pencil, Sparkles, Ticket, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import VolunteerPromptDialog from "@/components/volunteer-prompt-dialog";
import EventPickerField from "@/components/event-picker-field";
import RollCallBar from "@/components/roll-call-bar";
import { ClassEventsGrid, YachtGate } from "@/components/class-events-grid";
import { RosterClaim, YearbookConfirm } from "@/components/roster-claim";
import { MissingPhotoUpload } from "@/components/missing-photos";
import {
  buildClassEvents, applyAnswersToSlots, answersAfterCalendarEdit, applyYachtToSlots, checkChoice, clashesWith,
  openSlots, slotIdLabel, yachtEvent, whoIsGoing, whoPicksPills, effectiveAnswers, effectiveYacht, NAPOLI_KEY, YACHT_KEY,
  type EventAnswers, type YachtStatus,
} from "@/lib/class-events";
import { findRepeat, type DedupeHit } from "@/lib/pill-dedupe";
import type { MyMissingPhoto, MyRoster, RosterEntry } from "@/lib/use-reunion-data";
import { useToast } from "@/hooks/use-toast";
import {
  type Activity,
  type EventPlan,
  type MieventoTicketEntry,
  type MyIdentity,
  type Period,
  type Person,
  type SlotStatus,
  type ScheduledEvent,
  DAYS,
  HIDDEN_PILL_IDS,
  plannedSlotIds,
  toGroupPlannedId,
  EMAIL_PATTERN,
  END_DATE,
  MIEVENTO_TICKET_URL,
  PERIODS,
  PERIOD_LABEL,
  PERIOD_SHORT,
  START_DATE,
  STATUS_LABEL,
  STATUS_SHORT,
  arriveOptions,
  departOptions,
  eventsForDate,
  mergeActivities,
  writeMyIdentity,
  groupPlannedEventsForDate,
  initSlots,
  isGroupPlannedId,
  applyGroupPlanDefaults,
  isYachtLockSlot,
  labelForTag,
  eventCategoryClass,
  formatDateRange,
  mieventoOrEventLabel,
  statusesForSlot,
  suggestedMieventoEvents,
  selectedSuggestedEvents,
  applySuggestedEvents,
} from "@/lib/reunion";

interface EntryFormProps {
  initial?: Person | null;
  activities: Activity[];
  eventPlans: EventPlan[];
  /** Latest MiEvento ticket snapshot, shown per timeslot. */
  tickets?: TicketWatchRow[];
  onSave: (person: Person) => Promise<void>;
  onSuggestActivity: (id: string, label: string, suggestedBy: string) => Promise<void>;
  onGoToDashboard?: () => void;
  /** Needed to auto-prompt the Yacht Club payment reminder right after a fresh save. */
  people?: Person[];
  isDemo?: boolean;
  sessionEmail?: string | null;
  onSendSignInLink?: (email: string) => Promise<void>;
  onConfirmYachtPaid?: (paid: boolean) => Promise<void>;
  onSaveMieventoIntents?: (intents: Record<string, string>) => Promise<void>;
  onSaveMieventoTicketStatus?: (status: Record<string, MieventoTicketEntry>) => Promise<void>;
  /** Name+email remembered on this device from a prior submission, independent of sign-in. */
  myIdentity?: MyIdentity | null;
  onSignOut?: () => void;
  /** Set when a magic-link redirect failed to verify on page load. */
  linkError?: string | null;
  /** Asks the database whether an entry already uses this email (yes/no only). */
  onCheckEmailTaken?: (email: string) => Promise<boolean>;
  /** Class roster for "find your name" (2026-11 revamp). */
  roster?: RosterEntry[];
  myRoster?: MyRoster | null;
  myMissingPhoto?: MyMissingPhoto | null;
  onUploadMissingPhoto?: (file: File) => Promise<void>;
  claimError?: string | null;
  onConfirmYearbook?: (yes: boolean) => Promise<void>;
}

/** Saved Yacht answer, or what an older entry implies (see effectiveYacht). */
function yachtFrom(p?: Person | null): YachtStatus | null {
  return effectiveYacht(p);
}

/** Saved grid answers; the Napoli pill carries over as "plan to attend" Napoli lunch (owner, 2026-11-19). */
/** Starting answers: saved ones, plus what an older calendar implies (MiEvento on it = have the ticket). */
function answersFrom(p?: Person | null): EventAnswers {
  return p ? effectiveAnswers(p) : {};
}

/** Pill timeslot shades: 1, 2, 3+ classmates also picked that time (light → dark gold). */
const OTHERS_SHADES = ["hsl(45 95% 85%)", "hsl(43 92% 70%)", "hsl(40 90% 55%)"];

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

/** Shorter labels for the narrow mobile status-select trigger — full labels shown on sm:+ via responsive spans. */
const MOBILE_STATUS_SHORT: Record<SlotStatus, string> = {
  ok: "Avail.",
  maybe: "Maybe",
  busy: "MiEv.",
  private: "Private",
  "pool-day": "Pool day",
};
const MOBILE_BUSY_LABEL: Record<"MiEvento" | "Event/Activity", string> = {
  MiEvento: "MiEv.",
  "Event/Activity": "Event",
};

const LEGEND_ITEMS: { status: SlotStatus; label: string; hint: string }[] = [
  { status: "ok", label: "Available", hint: "Open — plan around me" },
  { status: "maybe", label: "Maybe", hint: "Possibly available" },
  { status: "busy", label: "MiEvento", hint: "MiEvento — existing event (Jan 17–24)" },
  { status: "busy", label: "Event/Activity", hint: "Event/Activity (Jan 9–16, 25–30)" },
  { status: "private", label: "Private", hint: "Private / unavailable" },
];

export default function EntryForm({ initial, activities, eventPlans, tickets = [], onSave, onSuggestActivity, onGoToDashboard, people, isDemo, sessionEmail, onSendSignInLink, onConfirmYachtPaid, onSaveMieventoIntents, onSaveMieventoTicketStatus, myIdentity, onSignOut, linkError, onCheckEmailTaken, roster = [], myRoster = null, claimError, onConfirmYearbook, myMissingPhoto = null, onUploadMissingPhoto }: EntryFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [arrival, setArrival] = useState(initial?.arrival ?? START_DATE);
  const [departure, setDeparture] = useState(initial?.departure ?? END_DATE);
  const [slots, setSlots] = useState(initial?.slots ?? applyGroupPlanDefaults(initSlots(START_DATE, END_DATE), eventPlans));
  // Event plans may arrive after first render — pre-fill live plan slots once for a fresh entry.
  const planDefaultsApplied = useRef(eventPlans.length > 0);
  useEffect(() => {
    if (planDefaultsApplied.current || initial || eventPlans.length === 0) return;
    planDefaultsApplied.current = true;
    setSlots((prev) => applyGroupPlanDefaults(prev, eventPlans));
  }, [eventPlans, initial]);
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [newActivityLabel, setNewActivityLabel] = useState("");
  const [attending, setAttending] = useState<boolean | null>(initial?.attending ?? null);
  // --- 2026-11 revamp: Yacht gate, events grid, pill timeslots -------------
  const catalog = useMemo(() => buildClassEvents(tickets), [tickets]);
  // Who else has tickets / plans to go, per event (names only; yourself and test entries left out).
  const whoGoing = useMemo(() => whoIsGoing(people ?? [], initial?.name ?? myRoster?.display_name), [people, initial?.name, myRoster?.display_name]);
  // Same idea for the interest pills: who picked each pill, and which timeslots they picked for it.
  const pillPeople = useMemo(() => whoPicksPills(people ?? [], initial?.name ?? myRoster?.display_name), [people, initial?.name, myRoster?.display_name]);
  const [yachtStatus, setYachtStatus] = useState<YachtStatus | null>(() => yachtFrom(initial));
  const [eventAnswers, setEventAnswers] = useState<EventAnswers>(() => answersFrom(initial));
  const [eventsDone, setEventsDone] = useState(Boolean(initial));
  const [pillSlots, setPillSlots] = useState<Record<string, string[]>>(initial?.pill_slots ?? {});
  const [openPill, setOpenPill] = useState<string | null>(null);
  const [suggestHit, setSuggestHit] = useState<DedupeHit | null>(null);
  const yachtAttending = yachtStatus === "planning" || yachtStatus === "paid";
  const [volunteerSupport, setVolunteerSupport] = useState<boolean | null>(initial?.volunteer_support ?? null);
  const [volunteerLead, setVolunteerLead] = useState<boolean | null>(initial?.volunteer_lead ?? null);
  const [volunteerStep, setVolunteerStep] = useState<"support" | "lead" | null>(null);
  const [volunteerPrompted, setVolunteerPrompted] = useState(interests.length > 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [suggestedChoices, setSuggestedChoices] = useState<string[]>(() =>
    selectedSuggestedEvents(initial?.slots ?? {}, initial?.arrival ?? START_DATE, initial?.departure ?? END_DATE),
  );
  const [eventChoiceMade, setEventChoiceMade] = useState(Boolean(initial));
  const [ticketCostsAcknowledged, setTicketCostsAcknowledged] = useState(false);
  const [eventsReviewed, setEventsReviewed] = useState(false);
  // The old 5-item "optional MiEvento events" review is replaced by the events grid.
  const suggestedEvents: ScheduledEvent[] = useMemo(() => [], []);
  void suggestedMieventoEvents;
  const eventReviewRequired = suggestedEvents.length > 0 && !eventsReviewed;
  const selectedEventCount = suggestedEvents.filter((event) => suggestedChoices.includes(event.id)).length;

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
    setSlots(initial.slots ?? applyGroupPlanDefaults(initSlots(initial.arrival ?? START_DATE, initial.departure ?? END_DATE), eventPlans));
    setSuggestedChoices(selectedSuggestedEvents(initial.slots ?? {}, initial.arrival ?? START_DATE, initial.departure ?? END_DATE));
    setEventChoiceMade(true);
    setTicketCostsAcknowledged(false);
    setEventsReviewed(false);
    setInterests(initial.interests ?? []);
    setAttending(initial.attending ?? null);
    setVolunteerSupport(initial.volunteer_support ?? null);
    setVolunteerLead(initial.volunteer_lead ?? null);
    setVolunteerPrompted((initial.interests ?? []).length > 0);
    setYachtStatus(yachtFrom(initial));
    setEventAnswers(answersFrom(initial));
    setEventsDone(true);
    setPillSlots(initial.pill_slots ?? {});
  }, [initial]);

  // Not signed in, but the name typed matches someone who already has a saved
  // entry (by name or by email) — their entry is protected: we load it for
  // review but block saving until they verify via the emailed sign-in link.
  // Member emails are never sent to the browser, so matching is by name here;
  // a typed email is checked separately with a yes/no database lookup.
  const matchedExisting = useMemo(() => {
    if (signedIn || !people) return null;
    const typedName = name.trim().toLowerCase();
    return (typedName && people.find((p) => !p.is_test && p.name.trim().toLowerCase() === typedName)) || null;
  }, [people, name, signedIn]);

  const [emailTaken, setEmailTaken] = useState(false);
  useEffect(() => {
    const typed = email.trim();
    if (signedIn || matchedExisting || !onCheckEmailTaken || !EMAIL_PATTERN.test(typed)) {
      setEmailTaken(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      onCheckEmailTaken(typed)
        .then((taken) => {
          if (!cancelled) setEmailTaken(taken);
        })
        .catch(() => {
          if (!cancelled) setEmailTaken(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, signedIn, matchedExisting, onCheckEmailTaken]);

  const matchedHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!matchedExisting) {
      matchedHydratedRef.current = null;
      return;
    }
    const key = matchedExisting.id ?? matchedExisting.name;
    if (matchedHydratedRef.current === key) return;
    matchedHydratedRef.current = key;
    setArrival(matchedExisting.arrival ?? START_DATE);
    setDeparture(matchedExisting.departure ?? END_DATE);
    setSlots(matchedExisting.slots ?? applyGroupPlanDefaults(initSlots(matchedExisting.arrival ?? START_DATE, matchedExisting.departure ?? END_DATE), eventPlans));
    setSuggestedChoices(selectedSuggestedEvents(matchedExisting.slots ?? {}, matchedExisting.arrival ?? START_DATE, matchedExisting.departure ?? END_DATE));
    setEventChoiceMade(true);
    setTicketCostsAcknowledged(false);
    setEventsReviewed(false);
    setInterests(matchedExisting.interests ?? []);
    setAttending(matchedExisting.attending ?? null);
    setVolunteerSupport(matchedExisting.volunteer_support ?? null);
    setVolunteerLead(matchedExisting.volunteer_lead ?? null);
    setVolunteerPrompted((matchedExisting.interests ?? []).length > 0);
  }, [matchedExisting]);

  const isProtected = (Boolean(matchedExisting) || emailTaken) && !signedIn;

  // --- Step-by-step gating for brand-new, first-time entries ---------------
  // Only a person with no known saved entry yet (no signed-in session, and
  // nothing already on file matching what they've typed) gets walked through
  // one section at a time. Anyone with an existing entry (signed in, or a
  // protected match found while typing) always sees the classic all-at-once
  // form so returning members aren't slowed down re-confirming old answers.
  const gatingActive = !initial && !matchedExisting && !emailTaken;
  const nameReadyToConfirm = name.trim().length > 0 && EMAIL_PATTERN.test(email.trim());
  const [nameConfirmedRaw, setNameConfirmed] = useState(false);
  // A signed-in classmate whose roster name is known doesn't need to confirm their name.
  const nameConfirmed = nameConfirmedRaw || Boolean(sessionEmail && myRoster);
  const [datesConfirmed, setDatesConfirmed] = useState(false);
  const [interestsConfirmed, setInterestsConfirmed] = useState(false);
  const [slotsConfirmed, setSlotsConfirmed] = useState(false);
  // New order (2026-11): name → dates → Yacht → events grid → calendar → pills → save.
  const showDatesSection = !gatingActive || nameConfirmed;
  const showYachtSection = !gatingActive || (nameConfirmed && datesConfirmed);
  const showGridSection = !gatingActive || (nameConfirmed && datesConfirmed && yachtStatus !== null);
  const showSlotsSection = !gatingActive || (nameConfirmed && datesConfirmed && yachtStatus !== null && eventsDone);
  const showInterestsSection = !gatingActive || (nameConfirmed && datesConfirmed && yachtStatus !== null && eventsDone && slotsConfirmed);
  const showTicketAndSave = !eventReviewRequired && (!gatingActive || (nameConfirmed && datesConfirmed && yachtStatus !== null && eventsDone && slotsConfirmed && interestsConfirmed));

  useEffect(() => {
    if (!sessionEmail) return;
    if (myRoster?.display_name && !initial) setName(myRoster.display_name);
    if (!initial) setEmail(sessionEmail);
  }, [sessionEmail, myRoster, initial]);

  // Calendar edits that take a grid event off all its slots untick it in the grid.
  // Only real edits: on first load an older entry's carried-over answers (e.g. the Napoli pill → Napoli
  // lunch) may not be on its calendar yet, and must not be unticked before the member touches anything.
  const firstSlots = useRef(slots);
  useEffect(() => {
    if (!eventsDone || slots === firstSlots.current) return;
    const { answers, dropped } = answersAfterCalendarEdit(slots, eventAnswers, catalog);
    if (!dropped.length) return;
    setEventAnswers(answers);
    toast({ title: "Events list updated", description: `Unticked ${dropped.map((e) => e.name).join(", ")} — it's no longer on your calendar.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  function changeYacht(next: YachtStatus) {
    setYachtStatus(next);
    setSlots((prev) => applyYachtToSlots(prev, next));
    if (next === "planning" || next === "paid") {
      // Going to the Yacht Club now: drop anything picked for the same Wed evening.
      const clash = Object.keys(eventAnswers).filter((k) => {
        const e = catalog.find((c) => c.key === k);
        return e && clashesWith(e, yachtEvent()).length > 0;
      });
      if (clash.length) {
        const next2 = { ...eventAnswers };
        clash.forEach((k) => delete next2[k]);
        setEventAnswers(next2);
        if (eventsDone) setSlots((prev) => applyYachtToSlots(applyAnswersToSlots(prev, next2, catalog, arrival, departure), next));
        toast({ title: "Wed evening is the Yacht Club", description: `Unticked ${clash.map((k) => catalog.find((c) => c.key === k)?.name).join(", ")}.` });
      }
    }
  }

  function changeAnswers(next: EventAnswers) {
    setEventAnswers(next);
    if (eventsDone) setSlots((prev) => applyAnswersToSlots(prev, next, catalog, arrival, departure));
  }

  function finishEvents() {
    setSlots((prev) => applyYachtToSlots(applyAnswersToSlots(prev, eventAnswers, catalog, arrival, departure), yachtStatus));
    setEventsDone(true);
    window.setTimeout(() => document.querySelector('[data-testid="card-slots"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const [linkSending, setLinkSending] = useState(false);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);
  const [linkSendError, setLinkSendError] = useState<string | null>(null);

  const czrVideoRef = useRef<HTMLVideoElement>(null);
  const czrHoverPlayRef = useRef(false);
  const [showYachtVideo, setShowYachtVideo] = useState(false);
  const yachtHideTimerRef = useRef<number | null>(null);

  function handleCzrVideoMouseEnter() {
    const video = czrVideoRef.current;
    if (!video || !video.paused) return;
    czrHoverPlayRef.current = true;
    video.play().catch(() => {
      czrHoverPlayRef.current = false;
    });
  }

  function handleCzrVideoMouseLeave() {
    const video = czrVideoRef.current;
    if (!video) return;
    if (czrHoverPlayRef.current) {
      video.pause();
    }
    czrHoverPlayRef.current = false;
  }

  function clearYachtHideTimer() {
    if (yachtHideTimerRef.current !== null) {
      window.clearTimeout(yachtHideTimerRef.current);
      yachtHideTimerRef.current = null;
    }
  }

  function showYachtOverlay() {
    clearYachtHideTimer();
    setShowYachtVideo(true);
  }

  function scheduleHideYachtOverlay() {
    clearYachtHideTimer();
    yachtHideTimerRef.current = window.setTimeout(() => {
      setShowYachtVideo(false);
    }, 300);
  }

  useEffect(() => {
    return () => clearYachtHideTimer();
  }, []);

  async function handleSendSignInLink() {
    const target = email.trim();
    if (!target || !EMAIL_PATTERN.test(target)) {
      setLinkSendError("Enter the email you used when you first saved, then request the link.");
      return;
    }
    if (!onSendSignInLink) return;
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
    setEventsReviewed(false);
    setTicketCostsAcknowledged(false);
    setEventChoiceMade(false);
    setSlotsConfirmed(false);
    setArrival(nextArrival);
    setDeparture(nextDeparture);
    setSlots((prev) => {
      const fresh = applyGroupPlanDefaults(initSlots(nextArrival, nextDeparture), eventPlans);
      // Preserve any answers already given for days still in range.
      for (const iso of Object.keys(fresh)) {
        if (prev[iso]) fresh[iso] = { ...fresh[iso], ...prev[iso] };
      }
      const withYacht = applyYachtToSlots(fresh, yachtStatus);
      return eventsDone ? applyAnswersToSlots(withYacht, eventAnswers, catalog, nextArrival, nextDeparture) : withYacht;
    });
  }

  function setSlotStatus(iso: string, period: Period, status: SlotStatus, tag?: string) {
    if (isYachtLockSlot(iso, period) && yachtAttending) return; // set by the Yacht answer
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
        if (isYachtLockSlot(iso, p) && yachtAttending) continue;
        next[iso][p] = { s: "busy" as SlotStatus, t: event.id };
      }
      return next;
    });
    // Picking a grid event from the calendar drop-down ticks it in the grid too (if allowed).
    const gridEvent = catalog.find((c) => c.key === event.id);
    if (gridEvent && !eventAnswers[gridEvent.key]) {
      const ok = checkChoice(gridEvent, "planning", { answers: eventAnswers, yacht: yachtStatus, catalog, arrival, departure });
      if (ok.allowed) setEventAnswers((prev) => ({ ...prev, [gridEvent.key]: "planning" }));
    }
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
    const adding = !interests.includes(id);
    setInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
    setOpenPill(adding ? id : openPill === id ? null : openPill);
    setSuggestHit(null);
  }

  const visiblePills = mergeActivities(activities).filter((a) => !HIDDEN_PILL_IDS.includes(a.id));
  const freeSlots = useMemo(() => openSlots(slots, arrival, departure), [slots, arrival, departure]);

  function togglePillSlot(pill: string, slotId: string) {
    setPillSlots((prev) => {
      const cur = prev[pill] ?? [];
      return { ...prev, [pill]: cur.includes(slotId) ? cur.filter((x) => x !== slotId) : [...cur, slotId].sort() };
    });
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

  function summarizeInterests(): string {
    if (interests.length === 0) return "No interest pills selected";
    const labels = interests.map((id) => labelForTag(id, activities));
    return labels.length > 3 ? `${labels.slice(0, 3).join(", ")} + ${labels.length - 3} more` : labels.join(", ");
  }

  async function handleSuggestActivity() {
    const label = newActivityLabel.trim();
    if (!label) return;
    const id = slugify(label);
    // Owner rule (2026-11-19): turn down anything that reuses a word of an existing pill or event.
    const hit = findRepeat(label, [
      ...visiblePills.map((a) => ({ id: a.id, label: a.label, kind: "pill" as const })),
      ...catalog.map((e) => ({ id: e.key, label: e.name, kind: "event" as const })),
      { id: YACHT_KEY, label: "Yacht Club Dinner Dance", kind: "event" as const },
    ]);
    if (hit) {
      setSuggestHit(hit);
      return;
    }
    setSuggestHit(null);
    // Guard against re-creating an activity that already exists (built-in or
    // previously suggested) under the same slug — this is what caused the
    // Interest Clusters duplicate-pill bug. Just mark interest in the existing
    // one instead of inserting a second row with the same id.
    const existing = mergeActivities(activities).find((a) => a.id === id);
    if (existing) {
      toast({
        title: "Already on the list",
        description: `"${existing.label}" is already one of the interest pills above \u2014 marked you as interested in it instead of adding a duplicate.`,
      });
      setInterests((prev) => (prev.includes(existing.id) ? prev : [...prev, existing.id]));
      setNewActivityLabel("");
      return;
    }
    await onSuggestActivity(id, label, name.trim() || "someone");
    setInterests((prev) => [...prev, id]);
    setOpenPill(id);
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
    if (gatingActive && (!nameConfirmed || !datesConfirmed || !eventsDone || !slotsConfirmed || !interestsConfirmed)) {
      setValidationError("Please finish each section above before saving.");
      return;
    }
    if (!yachtStatus) {
      setValidationError("Please answer the Yacht Club question above.");
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
        yacht_status: yachtStatus,
        event_answers: eventAnswers,
        // Only keep slot choices for pills still selected.
        pill_slots: Object.fromEntries(Object.entries(pillSlots).filter(([k, v]) => interests.includes(k) && v.length)),
      });
      writeMyIdentity({ name: name.trim(), email: email.trim() });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    const savedName = name.trim().toLowerCase();
    const myPersonRow = initial ?? people?.find((p) => p.name.trim().toLowerCase() === savedName) ?? null;
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
          {signedIn && onSendSignInLink && (
            <div className="w-full border-t pt-6">
              <RollCallBar
                people={people ?? []}
                isDemo={Boolean(isDemo)}
                sessionEmail={sessionEmail ?? null}
                myPerson={myPersonRow}
                onSendSignInLink={onSendSignInLink}
                onConfirmYachtPaid={onConfirmYachtPaid ?? (async () => {})}
                onSaveMieventoTicketStatus={onSaveMieventoTicketStatus ?? (async () => {})}
                variant="footer"
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!sessionEmail && onSendSignInLink) {
    return (
      <div className="space-y-8" data-testid="form-entry">
        <RosterClaim roster={roster} onSendSignInLink={onSendSignInLink} linkError={linkError} />
      </div>
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

      {myRoster ? (
        <Card data-testid="card-name">
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]" />
                Signed in as <strong>{myRoster.display_name}</strong>
                {myRoster.status === "pending_review" && <span className="text-xs text-muted-foreground">(new name — the organizers will confirm it)</span>}
              </span>
              {onSignOut && <Button type="button" size="sm" variant="ghost" onClick={onSignOut} data-testid="button-sign-out">Sign out</Button>}
            </div>
            {claimError && <p className="text-sm text-destructive" data-testid="text-claim-error">{claimError}</p>}
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="card-name">
        <CardHeader>
          <CardTitle>Your name</CardTitle>
        </CardHeader>
        {gatingActive && nameConfirmed ? (
        <CardContent>
          <div className="flex items-center justify-between text-sm" data-testid="text-name-confirmed">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]" />
              <strong>{name.split(" ")[0]}</strong>
              <span className="text-muted-foreground">— {email}</span>
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNameConfirmed(false)} data-testid="button-edit-name">
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        </CardContent>
        ) : (
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

          {gatingActive && (
            <div className="border-t pt-3">
              <Button type="button" disabled={!nameReadyToConfirm} onClick={() => setNameConfirmed(true)} data-testid="button-confirm-name">
                Confirm and continue
              </Button>
              {!nameReadyToConfirm && (
                <p className="mt-2 text-xs text-muted-foreground">Enter your name and a valid email to unlock the next section.</p>
              )}
            </div>
          )}

          {isProtected && (
            <p className="text-sm text-destructive" data-testid="text-protected-entry">
              {emailTaken && !matchedExisting
                ? "An entry already uses this email. If it's yours, request a sign-in link below to update it."
                : "This entry is protected. If it's yours, enter the email you used and request a sign-in link below."}
            </p>
          )}

          {onSendSignInLink && (signedIn || isProtected) && (
            <div className="space-y-1 border-t pt-3">
              {!signedIn && (
                <>
                  <p className="text-xs text-muted-foreground" data-testid="text-sign-in-link-reuse">
                    Already have a sign-in email from us? Look for it and click it to get back in — if you can't
                    find it or it's stopped working, request a new one below.
                  </p>
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
                </>
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
        )}
      </Card>
      )}
      {myRoster && onConfirmYearbook && <YearbookConfirm mine={myRoster} onAnswer={onConfirmYearbook} />}
      {/* No senior portrait (and no open "Is this you?" question): offer to add their own photo. */}
      {myRoster && myMissingPhoto && onUploadMissingPhoto && !(myRoster.yearbook_name && !myRoster.yearbook_confirmed) && (
        <MissingPhotoUpload mine={myMissingPhoto} onUpload={onUploadMissingPhoto} />
      )}
      {!myRoster && claimError && <p className="text-sm text-destructive" data-testid="text-claim-error">{claimError}</p>}

      {showDatesSection && (
      <Card data-testid="card-dates">
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
            <Select value={arrival} onValueChange={(value) => updateRange(value, value > departure ? value : departure)} disabled={gatingActive && datesConfirmed}>
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
            <Select value={departure} onValueChange={(value) => updateRange(value < arrival ? value : arrival, value)} disabled={gatingActive && datesConfirmed}>
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
        {gatingActive && (
          <CardContent className="pt-0">
            {datesConfirmed ? (
              <div className="flex items-center justify-between border-t pt-3 text-sm" data-testid="text-dates-confirmed">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]" />
                  <strong>{formatDateRange(arrival, departure)}</strong>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDatesConfirmed(false)} data-testid="button-edit-dates">
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            ) : (
              <div className="border-t pt-3">
                <Button type="button" onClick={() => setDatesConfirmed(true)} data-testid="button-confirm-dates">
                  Confirm and continue
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Double-check these dates reflect your actual arrival and departure before continuing.
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
      )}

      {showYachtSection && <YachtGate value={yachtStatus} onChange={changeYacht} who={whoGoing[YACHT_KEY]} />}

      {showGridSection && (
        <ClassEventsGrid
          catalog={catalog}
          answers={eventAnswers}
          yacht={yachtStatus}
          arrival={arrival}
          departure={departure}
          onChange={changeAnswers}
          done={eventsDone}
          onDone={finishEvents}
          who={whoGoing}
        />
      )}

      {showSlotsSection && (
      <Card data-testid="card-slots">
        <CardHeader>
          <CardTitle>Mark your time slots</CardTitle>
          <div className="text-sm text-muted-foreground space-y-1.5">
            <p>
              Unassigned time slots start as <span className="font-medium text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]">Available</span>.{" "}
              <span className="underline underline-offset-2">
                Change any slot where you already have plans — choose <strong className="font-bold">MiEvento</strong> and pick from what's scheduled that day.
              </span>{" "}
              Your MiEvento and class events are already filled in from the events list above.
            </p>
            <p className="italic text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]">
              Go through each block — a blank canvas of green reads as "free and ready to join," and the organizers
              will plan accordingly.
            </p>
            {suggestedEvents.length === 0 && <p>
              MiEvento events are optional and require separate tickets, not included in the Yacht Club dinner fee.
              Selecting a time slot does not purchase a ticket.{" "}
              <a href={MIEVENTO_TICKET_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline">
                Check current prices and buy/reserve on MiEvento
              </a>.
            </p>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {suggestedEvents.length > 0 && (
            <section className="space-y-4 rounded-md border border-primary/30 bg-primary/5 p-4" aria-labelledby="optional-events-heading" data-testid="optional-event-review">
              <div className="space-y-2">
                <h3 id="optional-events-heading" className="text-base font-semibold">Optional MiEvento events: choose before continuing</h3>
                <p className="text-sm">
                  These are suggestions, not automatic attendance. Choose individual events or select the displayed group, then confirm your plans.
                  Selecting an event here does not buy or reserve a ticket.
                </p>
                <p className="text-sm font-medium">
                  Separate paid tickets are required. These events are not included in the Yacht Club 87 Dinner/Dance fee.
                </p>
                <a className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline underline-offset-2"
                  href={MIEVENTO_TICKET_URL} target="_blank" rel="noreferrer" data-testid="link-review-mievento">
                  Check current prices and buy/reserve on MiEvento <ExternalLink className="h-4 w-4 shrink-0" />
                </a>
                <p className="text-xs text-muted-foreground">
                  Prices and a reliable total are not available here. Check each event's current price, fees and ticket availability on MiEvento before committing.
                  Ticket purchase status is tracked separately and is self-reported.
                </p>
              </div>
              {eventsReviewed ? (
                <div className="flex flex-wrap items-center justify-between gap-3" data-testid="event-review-complete">
                  <p className="text-sm">Event choices reviewed. Only events you select are added to your draft schedule; save the form to record changes.</p>
                  <Button type="button" variant="outline" className="min-h-11" data-testid="button-review-events"
                    onClick={() => {
                      setSuggestedChoices(selectedSuggestedEvents(slots, arrival, departure));
                      setEventChoiceMade(true);
                      setEventsReviewed(false);
                      setTicketCostsAcknowledged(false);
                      setSlotsConfirmed(false);
                    }}>Review event choices</Button>
                </div>
              ) : (
                <>
                  {(initial || matchedExisting) && <p className="text-sm" data-testid="legacy-event-notice">
                    Checked items reflect your previously saved schedule, which may include old defaults. Please verify them.
                    Nothing on file changes until you save.
                  </p>}
                  <div className="space-y-2">
                    {suggestedEvents.map((event) => (
                      <label key={event.id} className="flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3">
                        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary"
                          data-testid={`review-event-${event.id}`}
                          checked={suggestedChoices.includes(event.id)}
                          onChange={(e) => {
                            setSuggestedChoices((prev) => e.target.checked ? [...prev, event.id] : prev.filter((id) => id !== event.id));
                            setEventChoiceMade(true);
                          }} />
                        <span className="space-y-1">
                          <span className="block text-sm font-medium">{event.label}</span>
                          <span className="block text-xs text-muted-foreground">{event.note?.split(" — ")[0]} · Separate ticket; check price on MiEvento</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="min-h-11 whitespace-normal" data-testid="button-select-all-events"
                      onClick={() => { setSuggestedChoices(suggestedEvents.map((event) => event.id)); setEventChoiceMade(true); }}>
                      Select all {suggestedEvents.length} displayed events
                    </Button>
                    <Button type="button" variant="outline" className="min-h-11" data-testid="button-no-events"
                      onClick={() => { setSuggestedChoices([]); setEventChoiceMade(true); }}>None for now</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Newly selected events will occupy their scheduled time slots. You can adjust conflicts in the grid before saving.</p>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
                    <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" data-testid="checkbox-ticket-costs"
                      checked={ticketCostsAcknowledged} onChange={(e) => setTicketCostsAcknowledged(e.target.checked)} />
                    <span>I understand these optional events cost extra, are not included in the Yacht Club fee, and require separate tickets through MiEvento.</span>
                  </label>
                  <Button type="button" className="min-h-11 h-auto whitespace-normal" data-testid="button-confirm-events"
                    disabled={(!eventChoiceMade && selectedEventCount === 0) || !ticketCostsAcknowledged}
                    onClick={() => {
                      setSlots((prev) => applySuggestedEvents(prev, arrival, departure, suggestedChoices));
                      setEventsReviewed(true);
                    }}>
                    {selectedEventCount ? `Confirm ${selectedEventCount} planned event${selectedEventCount === 1 ? "" : "s"} and edit time slots` : "Continue without these events"}
                  </Button>
                </>
              )}
            </section>
          )}
          {eventReviewRequired && <p className="text-sm text-muted-foreground">Review the optional events above to unlock the time-slot grid. Suggestions below are not selected attendance.</p>}
          <fieldset disabled={eventReviewRequired || (gatingActive && slotsConfirmed)} className="space-y-3">
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
            <table className="w-full min-w-0 table-fixed border-collapse text-sm sm:min-w-[640px] sm:table-auto" data-testid="table-time-slots">
              <colgroup>
                <col className="w-16 sm:w-auto" />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-1 py-2 sm:px-3">Day</th>
                  {PERIODS.map((period) => (
                    <th key={period} className="px-1 py-2 sm:px-3">
                      <span className="sm:hidden">{PERIOD_SHORT[period]}</span>
                      <span className="hidden sm:inline">{PERIOD_LABEL[period]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.iso} className="border-b align-top last:border-0" data-testid={`row-day-${day.iso}`}>
                    <td className="px-1 py-2 text-xs font-medium sm:whitespace-nowrap sm:px-3 sm:py-3 sm:text-sm">
                      <div className="leading-tight sm:hidden">
                        <div>{day.weekday}</div>
                        <div className="text-[10px] text-muted-foreground/80">{day.iso.slice(5, 7)}/{day.iso.slice(8, 10)}</div>
                      </div>
                      <span className="hidden sm:inline">{day.label}</span>
                    </td>
                    {PERIODS.map((period) => {
                      const locked = isYachtLockSlot(day.iso, period) && yachtAttending;
                      const current = slots[day.iso]?.[period] ?? { s: "ok" as SlotStatus };
                      const statusOptions = statusesForSlot(day.iso, period, current.s);
                      const options = [
                        ...eventsForDate(day.iso, period, current.t).map((e) => ({ id: e.id, label: e.label, note: e.note, autoSlots: e.autoSlots })),
                        ...groupPlannedEventsForDate(day.iso, eventPlans, activities, period),
                      ];
                      return (
                        <td key={period} className="px-1 py-2 sm:px-3 sm:py-3">
                          {locked ? (
                            <div
                              className={cn("flex items-start gap-1 rounded-md border px-1.5 py-1.5 text-[11px] text-muted-foreground sm:px-3 sm:py-2 sm:text-sm", "bg-muted")}
                              data-testid={`slot-locked-${day.iso}-${period}`}
                              onMouseEnter={showYachtOverlay}
                              onMouseLeave={scheduleHideYachtOverlay}
                            >
                              <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                              <span>Yacht Club 87</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {eventReviewRequired && suggestedEvents.filter((event) =>
                                event.days?.includes(day.iso) && event.autoSlots?.includes(period) && current.t !== event.id,
                              ).map((event) => (
                                <p key={event.id} className="rounded-md border border-dashed p-1.5 text-xs text-muted-foreground" data-testid={`suggestion-${day.iso}-${period}`}>
                                  Suggested: {event.label}. Not selected.
                                </p>
                              ))}
                              <Select
                                value={current.s}
                                onValueChange={(value) => setSlotStatus(day.iso, period, value as SlotStatus, current.t)}
                              >
                                <SelectTrigger className={cn("h-8 px-1.5 text-[11px] sm:h-9 sm:px-3 sm:text-sm [&>svg]:h-3 [&>svg]:w-3 sm:[&>svg]:h-4 sm:[&>svg]:w-4", STATUS_COLOR[current.s])} data-testid={`select-status-${day.iso}-${period}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {statusOptions.map((s) => (
                                    <SelectItem key={s} value={s}>
                                      {s === "busy" ? (
                                        <>
                                          <span className="sm:hidden">{MOBILE_BUSY_LABEL[mieventoOrEventLabel(day.iso)]}</span>
                                          <span className="hidden sm:inline">{mieventoOrEventLabel(day.iso)}</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="sm:hidden">{MOBILE_STATUS_SHORT[s]}</span>
                                          <span className="hidden sm:inline">{STATUS_SHORT[s]}</span>
                                        </>
                                      )}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <SlotTicketHint tickets={ticketsForSlot(tickets, day.iso, period)} testId={`slot-tickets-${day.iso}-${period}`} />
                              {current.s === "busy" && (current.t && isGroupPlannedId(current.t)
                                ? <p className={cn("rounded-md px-2 py-1 text-xs", STATUS_COLOR.busy)}>{labelForTag(current.t, activities)}</p>
                                : options.length > 0 && (() => {
                                  const category = current.t ? eventCategoryClass(current.t) : undefined;
                                  return (
                                    <EventPickerField
                                      value={current.t ?? ""}
                                      options={options}
                                      onSelect={(value) => {
                                        const event = options.find((o) => o.id === value);
                                        if (event) selectEvent(day.iso, period, event);
                                      }}
                                      triggerClassName={cn(
                                        "h-8 text-xs",
                                        current.t ? cn("border-border/60 bg-card", category) : "tag-unanswered",
                                      )}
                                      optionClassName={eventCategoryClass}
                                      testId={`select-event-${day.iso}-${period}`}
                                    />
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
          </fieldset>
          {gatingActive && (
            slotsConfirmed ? (
              <div className="flex items-center justify-between border-t pt-3 text-sm" data-testid="text-slots-confirmed">
                <span className="flex items-center gap-1.5 font-medium text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]">
                  <CheckCircle2 className="h-4 w-4" /> Confirmed
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSlotsConfirmed(false)} data-testid="button-edit-slots">
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            ) : (
              <div className="border-t pt-3">
                <Button type="button" disabled={eventReviewRequired} onClick={() => setSlotsConfirmed(true)} data-testid="button-confirm-slots">
                  Confirm my time slots
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Available means organizers may plan around you. Review each day, mark private or uncertain times, then confirm to continue.
                </p>
              </div>
            )
          )}
        </CardContent>
      </Card>
      )}

      {showInterestsSection && (
      <Card data-testid="card-interests">
        <CardHeader>
          <CardTitle>What are you up for?</CardTitle>
          <p className="text-sm text-muted-foreground">
            BHS '87-only ideas the class could organize in your open time. Pick any pill, then choose which of your
            open timeslots you'd join it in. MiEvento and class events are already covered in the events list above.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {visiblePills.map((activity) => {
              const active = interests.includes(activity.id);
              const fans = pillPeople.byPill[activity.id] ?? [];
              return (
                <Tooltip key={activity.id}>
                <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => toggleInterest(activity.id)}
                  disabled={gatingActive && interestsConfirmed}
                  data-testid={`pill-interest-${activity.id}`}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors hover-elevate active-elevate-2",
                    active ? "bg-primary text-primary-foreground border-primary-border" : "bg-secondary text-secondary-foreground border-secondary-border",
                  )}
                >
                  {activity.label}
                  {active && (pillSlots[activity.id]?.length ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-primary-foreground/20 px-1.5 text-xs">{pillSlots[activity.id].length}</span>}
                  {fans.length > 0 && (
                    <span className={cn("ml-1.5 inline-flex items-center gap-0.5 text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")} data-testid={`pill-fans-${activity.id}`}>
                      <Users className="h-3 w-3" />{fans.length}
                    </span>
                  )}
                </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] text-xs" data-testid={`pill-fans-tip-${activity.id}`}>
                  {fans.length === 0 ? "No classmates have picked this yet." : <><strong>Interested ({fans.length}):</strong> {fans.join(", ")}</>}
                </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {interests.filter((id) => visiblePills.some((a) => a.id === id)).length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3" data-testid="pill-slot-picker">
              <p className="text-sm font-medium">When could you join?</p>
              <p className="text-xs text-muted-foreground">Only times you're Available or Maybe on your calendar are listed.</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="pill-slot-legend">
                <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-full border-2 border-[hsl(265_55%_45%)] bg-[hsl(265_60%_92%)]" aria-hidden="true" /> ★ Organizer&rsquo;s set time</span>
                <span className="inline-flex items-center gap-1">
                  {OTHERS_SHADES.map((c, i) => <span key={i} className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: c }} aria-hidden="true" />)}
                  Classmates also picked it (darker = more; hover to see who)
                </span>
              </div>
              {freeSlots.length === 0 && <p className="text-xs text-muted-foreground">You have no Available or Maybe slots on your calendar — mark some above to pick times.</p>}
              {interests.filter((id) => visiblePills.some((a) => a.id === id)).map((id) => {
                const label = visiblePills.find((a) => a.id === id)!.label;
                const chosen = pillSlots[id] ?? [];
                const isOpen = openPill === id;
                const planned = plannedSlotIds(id, eventPlans);
                // The organizer's time counts as open when the calendar already holds it for this activity.
                const heldForThis = (sid: string) => slots[sid.split(":")[0]]?.[sid.split(":")[1] as Period]?.t === toGroupPlannedId(id);
                const slotKey = (sid: string) => `${sid.split(":")[0]}${PERIODS.indexOf(sid.split(":")[1] as Period)}`;
                const pillSlotsList = [...freeSlots, ...planned.filter((sid) => !freeSlots.includes(sid) && heldForThis(sid))]
                  .sort((x, y) => slotKey(x).localeCompare(slotKey(y)));
                const plannedButBusy = planned.filter((sid) => !pillSlotsList.includes(sid));
                return (
                  <div key={id} className="rounded-md border bg-card">
                    <button type="button" onClick={() => setOpenPill(isOpen ? null : id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm" data-testid={`pill-slots-toggle-${id}`}>
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {chosen.length ? chosen.slice(0, 2).map(slotIdLabel).join(", ") + (chosen.length > 2 ? ` +${chosen.length - 2}` : "") : "pick times"} {isOpen ? "▲" : "▼"}
                      </span>
                    </button>
                    {isOpen && plannedButBusy.length > 0 && (
                      <p className="border-t px-3 py-1.5 text-xs text-[hsl(265_55%_35%)]" data-testid={`pill-lead-busy-${id}`}>
                        ★ The organizer set {plannedButBusy.map(slotIdLabel).join(", ")}, but you're not free then on your calendar.
                      </p>
                    )}
                    {isOpen && pillSlotsList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
                        {pillSlotsList.map((slotId) => {
                          const on = chosen.includes(slotId);
                          const maybe = slots[slotId.split(":")[0]]?.[slotId.split(":")[1] as Period]?.s === "maybe";
                          const others = pillPeople.bySlot[id]?.[slotId] ?? [];
                          const lead = planned.includes(slotId);
                          // Shade by how many classmates picked this time (1, 2, 3+); the organizer's set time gets a purple outline.
                          const shade = others.length > 0 && !on ? OTHERS_SHADES[Math.min(others.length, OTHERS_SHADES.length) - 1] : undefined;
                          const btn = (
                            <button key={slotId} type="button" onClick={() => togglePillSlot(id, slotId)} aria-pressed={on}
                              data-testid={`pill-slot-${id}-${slotId}`} data-others={others.length || undefined} data-lead={lead || undefined}
                              className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                                on ? "border-primary bg-primary text-primary-foreground" : lead ? "border-2 border-[hsl(265_55%_45%)] bg-[hsl(265_60%_92%)] text-[hsl(265_55%_25%)] font-medium" : maybe ? "status-maybe" : "status-ok",
                                lead && on && "ring-2 ring-[hsl(265_55%_45%)] ring-offset-1")}
                              style={shade && !lead ? { backgroundColor: shade, borderColor: "hsl(43 70% 40%)", color: "#1f1600" } : undefined}>
                              {lead && <span aria-hidden="true">★</span>}
                              {slotIdLabel(slotId)}{maybe ? " (maybe)" : ""}
                              {others.length > 0 && (
                                <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", on ? "bg-primary-foreground/25" : "bg-black/10")}>
                                  +{others.length}
                                </span>
                              )}
                            </button>
                          );
                          return others.length === 0 && !lead ? btn : (
                            <Tooltip key={slotId}>
                              <TooltipTrigger asChild>{btn}</TooltipTrigger>
                              <TooltipContent className="max-w-[240px] space-y-1 text-xs">
                                {lead && <p><strong>Organizer&rsquo;s set time</strong> for this activity.</p>}
                                {others.length > 0 && <p><strong>Also picked this time:</strong> {others.join(", ")}</p>}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="flex-1 min-w-[220px] space-y-2">
              <Label htmlFor="new-activity">Suggest another activity…</Label>
              <Input
                id="new-activity"
                value={newActivityLabel}
                onChange={(e) => setNewActivityLabel(e.target.value)}
                placeholder="Suggest an activity"
                data-testid="input-suggest-activity"
                disabled={gatingActive && interestsConfirmed}
              />
            </div>
            <Button type="button" variant="secondary" onClick={handleSuggestActivity} disabled={gatingActive && interestsConfirmed} data-testid="button-suggest-activity">
              <Sparkles className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          {suggestHit && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="status" data-testid="text-suggest-repeat">
              <p>
                “{newActivityLabel.trim()}” repeats <strong>{suggestHit.target.label}</strong> (“{suggestHit.word}”), so it can't be added as a new pill.
              </p>
              {suggestHit.target.kind === "pill" ? (
                <Button type="button" size="sm" variant="outline" className="mt-2" data-testid="button-join-existing-pill"
                  onClick={() => { if (!interests.includes(suggestHit.target.id)) toggleInterest(suggestHit.target.id); else setOpenPill(suggestHit.target.id); setNewActivityLabel(""); setSuggestHit(null); }}>
                  Join “{suggestHit.target.label}” instead
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" className="mt-2" data-testid="button-goto-event"
                  onClick={() => { document.querySelector(suggestHit.target.id === YACHT_KEY ? '[data-testid="card-yacht-gate"]' : `[data-testid="row-event-${suggestHit.target.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); setSuggestHit(null); setNewActivityLabel(""); }}>
                  It's in the events list — take me there
                </Button>
              )}
            </div>
          )}
          {gatingActive && (
            interestsConfirmed ? (
              <div className="flex items-center justify-between border-t pt-3 text-sm" data-testid="text-interests-confirmed">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]" />
                  <span>{summarizeInterests()}</span>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setInterestsConfirmed(false)} data-testid="button-edit-interests">
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
              </div>
            ) : (
              <div className="border-t pt-3">
                <Button type="button" onClick={() => setInterestsConfirmed(true)} data-testid="button-confirm-interests">
                  Confirm and continue
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">It's fine to leave this blank if nothing fits — just confirm to move on.</p>
              </div>
            )
          )}
        </CardContent>
      </Card>
      )}

      {showYachtVideo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 pointer-events-none"
          data-testid="overlay-yacht-video"
        >
          <video
            className="max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl pointer-events-auto"
            autoPlay
            muted
            controls
            playsInline
            onMouseEnter={showYachtOverlay}
            onMouseLeave={scheduleHideYachtOverlay}
            data-testid="video-yacht-club"
          >
            <source src={`${import.meta.env.BASE_URL}videos/yacht-club-dinner-dance.mp4`} type="video/mp4" />
          </video>
        </div>
      )}

      {showTicketAndSave && (
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
      )}

      {validationError && (
        <p className="text-sm text-destructive" role="alert" data-testid="text-validation-error">
          {validationError}
        </p>
      )}

      {gatingActive && !showTicketAndSave && (
        <p className="text-sm text-muted-foreground" data-testid="text-gating-hint">
          Confirm each section above to unlock the Ticket-check and Save step.
        </p>
      )}

      {showTicketAndSave && (
      <div className="flex items-center justify-between">
        <Badge variant="secondary">{interests.length} interests selected</Badge>
        <Button type="submit" disabled={saving} data-testid="button-save-availability">
          {saving ? "Saving…" : "Save my Info"}
        </Button>
      </div>
      )}

      <div
        className="overflow-hidden rounded-md border bg-black"
        onMouseEnter={handleCzrVideoMouseEnter}
        onMouseLeave={handleCzrVideoMouseLeave}
        data-testid="container-czr-video"
      >
        <video
          ref={czrVideoRef}
          className="block w-full max-h-[360px] mx-auto"
          controls
          muted
          playsInline
          preload="metadata"
          data-testid="video-czr-events"
        >
          <source src={`${import.meta.env.BASE_URL}videos/czr-events.mp4`} type="video/mp4" />
        </video>
      </div>

    </form>
  );
}
