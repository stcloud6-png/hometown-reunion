import { Fragment, useState } from "react";
import { AlertTriangle, Anchor, CheckCircle2, ExternalLink, Info, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  checkChoice, toggleChoice, NAPOLI_KEY,
  type ClassEvent, type EventAnswer, type EventAnswers, type YachtStatus,
} from "@/lib/class-events";
import { MIEVENTO_TICKETS_URL, formatTicketDay } from "@/lib/ticket-watch";

// ---------------------------------------------------------------------------
// Step: Yacht Club gate
// ---------------------------------------------------------------------------

const YACHT_OPTIONS: { value: YachtStatus; title: string; hint: string }[] = [
  { value: "paid", title: "Paid — I have my ticket", hint: "Already paid for the Wed 20 dinner/dance." },
  { value: "planning", title: "Planning to attend", hint: "Haven't paid yet, but I'm going." },
  { value: "not_attending", title: "Can't make it", hint: "I won't be at the Wed 20 dinner/dance." },
];

export function YachtGate({ value, onChange, disabled }: { value: YachtStatus | null; onChange: (v: YachtStatus) => void; disabled?: boolean }) {
  return (
    <Card data-testid="card-yacht-gate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Anchor className="h-5 w-5" /> Yacht Club '87 Dinner/Dance — Wed Jan 20, evening</CardTitle>
        <p className="text-sm text-muted-foreground">
          The class event everyone should be at. Let us know where you stand — you can change this later.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {YACHT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            data-testid={`yacht-${o.value}`}
            className={cn(
              "rounded-md border p-4 text-left transition-colors hover-elevate active-elevate-2 disabled:opacity-60",
              value === o.value ? "border-primary bg-primary/10" : "border-card-border",
            )}
          >
            <p className="flex items-center gap-1.5 font-medium">
              {value === o.value && <CheckCircle2 className="h-4 w-4 text-primary" />} {o.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{o.hint}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step: MiEvento + BHS class events grid
// ---------------------------------------------------------------------------

interface GridProps {
  catalog: ClassEvent[];
  answers: EventAnswers;
  yacht: YachtStatus | null;
  arrival: string;
  departure: string;
  onChange: (next: EventAnswers) => void;
  /** Shown under the grid until pressed; after that, changes go straight to the calendar. */
  done: boolean;
  onDone: () => void;
}

interface Note { key: string; col: EventAnswer; text: string; tone: "block" | "warn" }

export function ClassEventsGrid({ catalog, answers, yacht, arrival, departure, onChange, done, onDone }: GridProps) {
  const [note, setNote] = useState<Note | null>(null);
  const ctx = { answers, yacht, catalog, arrival, departure };

  function click(event: ClassEvent, col: EventAnswer) {
    const { answers: next, result } = toggleChoice(event, col, ctx);
    if (!result.allowed) setNote({ key: event.key, col, text: result.reason ?? "Not available.", tone: "block" });
    else if (result.warning) setNote({ key: event.key, col, text: result.warning, tone: "warn" });
    else setNote(null);
    if (next !== answers) onChange(next);
  }

  let lastDate = "";
  const picked = Object.keys(answers).length;

  return (
    <Card data-testid="card-class-events">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Ticket className="h-5 w-5" /> MiEvento &amp; BHS class events</CardTitle>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Go row by row. For each event tick <strong>one</strong> box — or neither if you're skipping it.</p>
          <p>
            <strong>Plan / want to attend</strong> = you intend to go. <strong>Have my ticket</strong> = you've already bought it on MiEvento.
            Sold-out events only allow “Have my ticket”. You can't pick two events at the same time.
          </p>
          <a href={MIEVENTO_TICKETS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2">
            Buy tickets on MiEvento <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm" data-testid="table-class-events">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Event</th>
                <th className="w-24 px-2 py-2 text-center sm:w-36">Plan / want to attend</th>
                <th className="w-24 px-2 py-2 text-center sm:w-36">Have my ticket</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((event) => {
                const showDay = event.date !== lastDate;
                lastDate = event.date;
                const out = event.date < arrival || event.date > departure;
                const current = answers[event.key];
                const planCheck = current === "planning" ? { allowed: true } : checkChoice(event, "planning", ctx);
                const ticketCheck = current === "purchased" ? { allowed: true } : checkChoice(event, "purchased", ctx);
                const rowNote = note?.key === event.key ? note : null;
                return (
                  <Fragment key={event.key}>
                    {showDay && (
                      <tr key={`d-${event.date}`} className="border-b bg-muted/20">
                        <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {formatTicketDay(event.date)}{event.key === NAPOLI_KEY ? " · BHS '87 class event" : ""}
                        </td>
                      </tr>
                    )}
                    <tr key={event.key} className={cn("border-b align-top last:border-0", out && "opacity-50")} data-testid={`row-event-${event.key}`}>
                      <td className="px-3 py-2">
                        <p className={cn("font-medium leading-snug", event.soldOut && "text-muted-foreground")}>{event.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[event.timeLabel, event.price != null ? (event.price === 0 ? "Free" : `$${event.price}`) : null].filter(Boolean).join(" · ")}
                          {event.soldOut && <span className="ml-1.5 rounded-full border border-red-200 bg-red-100 px-1.5 text-[10px] font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">Sold out</span>}
                          {event.lowStock != null && <span className="ml-1.5 rounded-full border border-amber-200 bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">Only {event.lowStock} left</span>}
                        </p>
                        {rowNote && (
                          <p
                            role="status"
                            className={cn("mt-1.5 flex items-start gap-1.5 rounded-md px-2 py-1 text-xs",
                              rowNote.tone === "block" ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200")}
                            data-testid={`note-${event.key}`}
                          >
                            {rowNote.tone === "block" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                            {rowNote.text}
                          </p>
                        )}
                      </td>
                      <Cell checked={current === "planning"} blocked={!planCheck.allowed} label={`Plan to attend ${event.name}`}
                        onClick={() => click(event, "planning")} testId={`plan-${event.key}`} />
                      {event.planOnly ? (
                        <td className="px-2 py-2 text-center text-xs text-muted-foreground">No ticket needed</td>
                      ) : (
                        <Cell checked={current === "purchased"} blocked={!ticketCheck.allowed} label={`Have my ticket for ${event.name}`}
                          onClick={() => click(event, "purchased")} testId={`ticket-${event.key}`} />
                      )}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {done ? (
          <p className="flex items-center gap-1.5 text-sm text-[hsl(155_48%_25%)] dark:text-[hsl(150_40%_70%)]" data-testid="text-events-done">
            <CheckCircle2 className="h-4 w-4" /> Your calendar below is filled in from these choices. Changes here update it straight away.
          </p>
        ) : (
          <div className="border-t pt-3">
            <Button type="button" onClick={onDone} data-testid="button-events-done">
              I'm done selecting MiEvento / BHS class events{picked ? ` (${picked})` : ""}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">We'll put these on your calendar below. You can come back and change them any time.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Cell({ checked, blocked, label, onClick, testId }: { checked: boolean; blocked: boolean; label: string; onClick: () => void; testId: string }) {
  // Blocked boxes stay clickable so the reason shows up immediately next to the row.
  return (
    <td className="px-2 py-2 text-center">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={onClick}
        data-testid={testId}
        data-blocked={blocked || undefined}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md border-2 transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : blocked ? "cursor-not-allowed border-dashed border-muted-foreground/40 bg-muted/60" : "border-muted-foreground/50 hover:border-primary",
        )}
      >
        {checked && <CheckCircle2 className="h-4 w-4" />}
      </button>
    </td>
  );
}
