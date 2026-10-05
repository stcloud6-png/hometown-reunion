import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Ticket, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  LEVEL_CLASS,
  MIEVENTO_TICKETS_URL,
  formatCheckedAt,
  isTicketDataStale,
  formatTicketDay,
  shortTicketName,
  sortByUrgency,
  ticketBadgeText,
  ticketLevel,
  ticketSummary,
  ticketTimeLabel,
  type TicketWatchRow,
  type TicketWatchRun,
} from "@/lib/ticket-watch";

export function TicketBadge({ ticket, className }: { ticket: TicketWatchRow; className?: string }) {
  const level = ticketLevel(ticket);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none", LEVEL_CLASS[level], className)}
      data-testid={`badge-ticket-${level}`}
    >
      {ticketBadgeText(ticket)}
    </span>
  );
}

function TicketLine({ ticket, showDay = true }: { ticket: TicketWatchRow; showDay?: boolean }) {
  const time = ticketTimeLabel(ticket);
  const sold = ticketLevel(ticket) === "sold_out";
  return (
    <li className="flex items-start justify-between gap-3 py-2" data-testid="ticket-line">
      <div className="min-w-0">
        <p className={cn("text-sm font-medium leading-snug", sold && "text-muted-foreground line-through decoration-muted-foreground/40")}>{shortTicketName(ticket)}</p>
        <p className="text-xs text-muted-foreground">
          {[showDay ? formatTicketDay(ticket.event_date) : null, time, ticket.price != null ? `$${ticket.price}` : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      <TicketBadge ticket={ticket} className="mt-0.5" />
    </li>
  );
}

function SummaryLine({ tickets }: { tickets: TicketWatchRow[] }) {
  const s = ticketSummary(tickets);
  const parts = [
    s.sold_out ? `${s.sold_out} sold out` : null,
    s.low ? `${s.low} almost gone` : null,
    s.available ? `${s.available} available` : null,
  ].filter(Boolean);
  return <>{parts.join(" · ")}</>;
}

/** Full ticket watch card: urgent tickets first, then everything else on request. */
/** `fitHeight`: fill the parent's height and scroll the ticket list inside the card (landing side frame). */
export function TicketWatchCard({ tickets, run, onRegister, className, fitHeight = false }: { tickets: TicketWatchRow[]; run: TicketWatchRun | null; onRegister?: () => void; className?: string; fitHeight?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // In the fixed-height side frame, bring the newly revealed tickets into view.
  useEffect(() => {
    if (!fitHeight || !showAll || !listRef.current || !toggleRef.current) return;
    listRef.current.scrollTo({ top: toggleRef.current.offsetTop - 4, behavior: "smooth" });
  }, [showAll, fitHeight]);
  const sorted = useMemo(() => sortByUrgency(tickets), [tickets]);
  const urgent = sorted.filter((t) => ["sold_out", "low"].includes(ticketLevel(t)));
  const rest = sorted.filter((t) => !["sold_out", "low"].includes(ticketLevel(t))).sort((a, b) => a.event_date.localeCompare(b.event_date));

  return (
    <section className={cn("rounded-xl border bg-card shadow-sm", fitHeight && "flex h-full flex-col overflow-hidden", className)} data-testid="card-ticket-watch" aria-labelledby="ticket-watch-title">
      <div className="shrink-0 border-b p-4 pb-3">
        <div className="flex items-center gap-2">
          <Ticket className="size-4 text-primary" aria-hidden="true" />
          <h2 id="ticket-watch-title" className="font-serif text-lg font-semibold leading-none">MiEvento ticket watch</h2>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground" data-testid="text-ticket-summary">
          <SummaryLine tickets={tickets} />
        </p>
      </div>

      <div ref={listRef} className={cn("relative px-4", fitHeight && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2")} data-testid="ticket-watch-list">
        {urgent.length > 0 && (
          <>
            <p className="pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Going fast</p>
            <ul className="divide-y">{urgent.map((t) => <TicketLine key={t.watch_key} ticket={t} />)}</ul>
          </>
        )}
        {rest.length > 0 && (
          <>
            <button
              ref={toggleRef}
              type="button"
              className="flex w-full items-center justify-between pt-3 pb-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              data-testid="button-ticket-show-all"
            >
              <span>Still available ({rest.length})</span>
              <span className="normal-case tracking-normal text-primary">{showAll ? "Hide" : "Show all"}</span>
            </button>
            {showAll && <ul className="divide-y">{rest.map((t) => <TicketLine key={t.watch_key} ticket={t} />)}</ul>}
          </>
        )}
      </div>

      <div className={cn("space-y-2 p-4", fitHeight && "shrink-0 border-t pt-3")}>
        <Button asChild className="w-full" data-testid="link-mievento-tickets">
          <a href={MIEVENTO_TICKETS_URL} target="_blank" rel="noreferrer">
            Get tickets on MiEvento <ExternalLink className="ml-1.5 size-3.5" aria-hidden="true" />
          </a>
        </Button>
        {onRegister && (
          <Button variant="outline" className="w-full" onClick={onRegister} data-testid="button-ticket-register">
            Mark my availability
          </Button>
        )}
        {isTicketDataStale(run) && run && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200" data-testid="text-ticket-stale">
            Last updated {formatCheckedAt(run.ran_at)}. See MiEvento for the latest.
          </p>
        )}
        <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
          Checked daily{run ? ` · last checked ${formatCheckedAt(run.ran_at)}` : ""}. "Only N left" uses MiEvento's current purchase limit, so treat it as a close estimate.
        </p>
      </div>
    </section>
  );
}

const POPUP_KEY = "czr-ticket-popup-shown";

/** Mobile: floating pill that opens the ticket watch; auto-opens once a day when something is selling out. */
export function TicketWatchMobile({ tickets, run, onRegister }: { tickets: TicketWatchRow[]; run: TicketWatchRun | null; onRegister?: () => void }) {
  const [open, setOpen] = useState(false);
  const s = ticketSummary(tickets);
  const urgentCount = s.sold_out + s.low;
  const autoChecked = useRef(false);

  useEffect(() => {
    if (autoChecked.current || tickets.length === 0 || urgentCount === 0) return;
    autoChecked.current = true;
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 1023px)").matches) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (window.localStorage.getItem(POPUP_KEY) === today) return;
      window.localStorage.setItem(POPUP_KEY, today);
    } catch {
      /* storage blocked — still show once per load */
    }
    const timer = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, [tickets.length, urgentCount]);

  if (tickets.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-sm items-center justify-center gap-2 rounded-full border bg-card/95 px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur lg:hidden"
        data-testid="button-ticket-watch-mobile"
      >
        <Ticket className="size-4 text-primary" aria-hidden="true" />
        <span>Tickets: {s.sold_out ? `${s.sold_out} sold out` : `${s.available} available`}{s.low ? ` · ${s.low} almost gone` : ""}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-md overflow-y-auto p-0" data-testid="dialog-ticket-watch" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="sr-only">
            <DialogTitle>MiEvento ticket watch</DialogTitle>
            <DialogDescription>Which reunion tickets are sold out or almost gone.</DialogDescription>
          </DialogHeader>
          <TicketWatchCard
            tickets={tickets}
            run={run}
            className="border-0 shadow-none"
            onRegister={onRegister ? () => { setOpen(false); onRegister(); } : undefined}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Timeslot hint: small chip under a slot; hover (desktop) or tap (mobile) to see that slot's MiEvento tickets. */
export function SlotTicketHint({ tickets, testId }: { tickets: TicketWatchRow[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  if (tickets.length === 0) return null;
  const s = ticketSummary(tickets);
  const level = s.sold_out ? "sold_out" : s.low ? "low" : "available";
  const label = s.sold_out ? `${s.sold_out} sold out` : s.low ? `${s.low} almost gone` : `${tickets.length} on sale`;
  const hover = (v: boolean) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (v) setOpen(true);
    else closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("flex w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium sm:text-[11px]", level === "available" ? "border-dashed bg-transparent text-muted-foreground hover:text-foreground" : LEVEL_CLASS[level])}
          onMouseEnter={() => hover(true)}
          onMouseLeave={() => hover(false)}
          data-testid={testId}
        >
          <Ticket className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate sm:hidden">{s.sold_out ? "Sold out" : s.low ? "Few left" : "On sale"}</span>
          <span className="hidden truncate sm:inline">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)} data-testid="popover-slot-tickets">
        <p className="text-xs font-semibold">MiEvento tickets · {tickets[0] ? formatTicketDay(tickets[0].event_date) : ""}</p>
        <ul className="mt-1 divide-y">
          {tickets.map((t) => <TicketLine key={t.watch_key} ticket={t} showDay={false} />)}
        </ul>
        <a href={MIEVENTO_TICKETS_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Get tickets on MiEvento <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </PopoverContent>
    </Popover>
  );
}

/** Maintenance-only health line for the daily MiEvento check. */
export function TicketWatchStatus({ health, lastGood }: { health: TicketWatchRun | null; lastGood: TicketWatchRun | null }) {
  const stale = isTicketDataStale(lastGood);
  const level = !health ? "unknown" : health.health === "action" || health.ok === false ? "action" : health.health === "warning" || stale ? "warning" : "ok";
  const styles = {
    ok: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    warning: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
    action: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
    unknown: "border-border bg-muted/40 text-muted-foreground",
  }[level];
  const Icon = level === "ok" ? CheckCircle2 : level === "action" ? XCircle : AlertTriangle;
  const title = {
    ok: "OK",
    warning: health?.layout_changed ? "page layout changed — please review" : stale ? "data is out of date" : "needs a look",
    action: "needs action — snapshot not updated",
    unknown: "no check recorded yet",
  }[level];
  const warnings = [...(health?.warnings ?? [])];
  if (stale && lastGood) warnings.push(`Last good snapshot ${formatCheckedAt(lastGood.ran_at)} (over 36 hours ago)`);
  return (
    <div className={cn("rounded-md border px-3 py-2 text-xs", styles)} data-testid="ticket-watch-status" data-level={level}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold">Ticket watch: {title}</p>
          {health && (
            <p className="opacity-80">
              Checked {formatCheckedAt(health.ran_at)}
              {health.tickets != null ? ` · ${health.tickets} tickets` : ""}
              {health.dates != null ? ` · ${health.dates} dates` : ""}
            </p>
          )}
          {warnings.map((w) => (
            <p key={w} className="break-words">{w}</p>
          ))}
          {(level === "action" || stale) && (
            <p className="opacity-80">The public panel keeps showing the last good snapshot until this is fixed.</p>
          )}
          {level === "warning" && !stale && (
            <p className="opacity-80">Tickets were still read and the snapshot was updated — check that the panel looks right.</p>
          )}
        </div>
      </div>
    </div>
  );
}
