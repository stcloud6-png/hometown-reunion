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
import { CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
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
  STATUSES,
  STATUS_SHORT,
  eventsForDate,
  groupPlannedEventsForDate,
  initSlots,
  isYachtLockSlot,
  labelForTag,
  mieventoOrEventLabel,
} from "@/lib/reunion";

interface EntryFormProps {
  initial?: Person | null;
  activities: Activity[];
  eventPlans: EventPlan[];
  onSave: (person: Person) => Promise<void>;
  onSuggestActivity: (id: string, label: string, suggestedBy: string) => Promise<void>;
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
};

export default function EntryForm({ initial, activities, eventPlans, onSave, onSuggestActivity }: EntryFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [arrival, setArrival] = useState(initial?.arrival ?? START_DATE);
  const [departure, setDeparture] = useState(initial?.departure ?? END_DATE);
  const [slots, setSlots] = useState(initial?.slots ?? initSlots(START_DATE, END_DATE));
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [newActivityLabel, setNewActivityLabel] = useState("");
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
    setInterests((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
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
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      setValidationError("That email address doesn't look right.");
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
        email: email.trim() || null,
        arrival,
        departure,
        slots,
        interests,
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
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" data-testid="form-entry">
      <Card>
        <CardHeader>
          <CardTitle>Who's asking</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" data-testid="input-name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="arrival">In town from</Label>
            <Input
              id="arrival"
              type="date"
              min={START_DATE}
              max={departure}
              value={arrival}
              onChange={(e) => updateRange(e.target.value, departure)}
              data-testid="input-arrival"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="departure">In town to</Label>
            <Input
              id="departure"
              type="date"
              min={arrival}
              max={END_DATE}
              value={departure}
              onChange={(e) => updateRange(arrival, e.target.value)}
              data-testid="input-departure"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your day-by-day availability</CardTitle>
          <p className="text-sm text-muted-foreground">
            Everything defaults to Available. Mark anything you already have plans for — the Yacht Club
            dinner/dance is locked in for everyone on Wednesday evening, Jan 20.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {days.map((day) => (
            <div key={day.iso} className="rounded-md border p-3" data-testid={`row-day-${day.iso}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{day.label}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PERIODS.map((period) => {
                  const locked = isYachtLockSlot(day.iso, period);
                  const current = slots[day.iso]?.[period] ?? { s: "ok" as SlotStatus };
                  const options = [
                    ...eventsForDate(day.iso).map((e) => ({ id: e.id, label: e.label })),
                    ...groupPlannedEventsForDate(day.iso, eventPlans, activities),
                  ];
                  return (
                    <div key={period} className="space-y-1">
                      <span className="text-xs uppercase text-muted-foreground">{PERIOD_LABEL[period]}</span>
                      {locked ? (
                        <div className={cn("rounded-md border px-3 py-2 text-sm", STATUS_COLOR.busy)} data-testid={`slot-locked-${day.iso}-${period}`}>
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
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s === "busy" ? mieventoOrEventLabel(day.iso) : STATUS_SHORT[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {current.s === "busy" && options.length > 0 && (
                            <Select
                              value={current.t ?? ""}
                              onValueChange={(value) => setSlotStatus(day.iso, period, "busy", value)}
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`select-event-${day.iso}-${period}`}>
                                <SelectValue placeholder="Which one?" />
                              </SelectTrigger>
                              <SelectContent>
                                {options.map((o) => (
                                  <SelectItem key={o.id} value={o.id}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {current.s === "busy" && current.t && (
                            <p className="text-xs text-muted-foreground">{labelForTag(current.t, activities)}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What are you interested in?</CardTitle>
          <p className="text-sm text-muted-foreground">Pick anything you'd want to join if the group organizes it.</p>
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
              <Label htmlFor="new-activity">Something not on the list?</Label>
              <Input
                id="new-activity"
                value={newActivityLabel}
                onChange={(e) => setNewActivityLabel(e.target.value)}
                placeholder="Suggest an activity"
                data-testid="input-suggest-activity"
              />
            </div>
            <Button type="button" variant="secondary" onClick={handleSuggestActivity} data-testid="button-suggest-activity">
              <Sparkles className="mr-1 h-4 w-4" /> Suggest
            </Button>
          </div>
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
          {saving ? "Saving…" : "Save my availability"}
        </Button>
      </div>
    </form>
  );
}
