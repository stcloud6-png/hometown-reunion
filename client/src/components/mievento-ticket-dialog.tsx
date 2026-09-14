import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ExternalLink, Loader2, Mail, Ticket } from "lucide-react";
import {
  EMAIL_PATTERN,
  MIEVENTO_TICKET_STATUSES,
  MIEVENTO_TICKET_STATUS_LABEL,
  MIEVENTO_TICKET_URL,
  mieventoShoppingEvents,
  type MieventoTicketEntry,
  type MieventoTicketStatusValue,
  type Person,
} from "@/lib/reunion";

interface MieventoTicketDialogProps {
  isDemo: boolean;
  sessionEmail: string | null;
  myPerson: Person | null;
  onSendSignInLink: (email: string) => Promise<void>;
  onSaveTicketStatus: (status: Record<string, MieventoTicketEntry>) => Promise<void>;
  /** Renders a compact icon-only trigger instead of the full-width button — used inside shopping list cards. */
  compact?: boolean;
}

/**
 * Self-serve ticket-status tracker for the "tickets coming soon" MiEvento
 * sub-events (Railway, Coffee House 2027, MEGA Cruise, Railroad Dome Car).
 * Each signed-in respondent records where they stand per event — haven't
 * registered / looking into it / purchased — plus an optional note, stored
 * as `people.mievento_ticket_status` (JSONB, keyed by ScheduledEvent id).
 * Gated behind the same magic-link sign-in as the Yacht Club and MiEvento
 * interest dialogs, for the same RLS reason.
 */
export default function MieventoTicketDialog({
  isDemo,
  sessionEmail,
  myPerson,
  onSendSignInLink,
  onSaveTicketStatus,
  compact,
}: MieventoTicketDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(sessionEmail ?? "");
  const [linkSent, setLinkSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, MieventoTicketEntry>>({});
  const events = mieventoShoppingEvents();

  useEffect(() => {
    if (open) setEntries(myPerson?.mievento_ticket_status ?? {});
  }, [open, myPerson]);

  const signedIn = Boolean(sessionEmail);

  function setStatus(eventId: string, status: MieventoTicketStatusValue) {
    setEntries((prev) => ({ ...prev, [eventId]: { ...prev[eventId], status } }));
  }

  function setNote(eventId: string, note: string) {
    setEntries((prev) => ({ ...prev, [eventId]: { status: prev[eventId]?.status ?? "not_registered", note } }));
  }

  async function sendLink() {
    if (!EMAIL_PATTERN.test(email)) {
      setError("Enter the email you used on your reunion entry.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSendSignInLink(email);
      setLinkSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the sign-in link.");
    } finally {
      setSending(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSaveTicketStatus(entries);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your ticket status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setLinkSent(false); setError(null); } }}>
      <DialogTrigger asChild>
        {compact ? (
          <Button size="sm" variant="outline" data-testid="button-open-mievento-tickets">
            <Ticket className="mr-1 h-4 w-4" /> My ticket status
          </Button>
        ) : (
          <Button size="sm" variant="secondary" data-testid="button-open-mievento-tickets">
            <Ticket className="mr-1 h-4 w-4" /> Update my ticket status
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="dialog-mievento-tickets">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" /> MiEvento ticket status
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            These MiEvento events need tickets bought directly through MiEvento, not through this site. Let the
            group know where you stand on each one, so organizers know how many classmates are likely to be there.
          </p>
          <Button asChild size="sm" variant="outline" className="w-fit">
            <a href={MIEVENTO_TICKET_URL} target="_blank" rel="noreferrer" data-testid="link-mievento-buy-tickets-dialog">
              <ExternalLink className="mr-1 h-4 w-4" /> Buy MiEvento tickets
            </a>
          </Button>
        </DialogHeader>

        {signedIn ? (
          <div className="space-y-4">
            <p className="text-sm" data-testid="text-mievento-tickets-signed-in-as">
              Signed in as <span className="font-medium">{sessionEmail}</span>
            </p>
            <div className="space-y-4">
              {events.map((event) => {
                const entry = entries[event.id];
                return (
                  <div key={event.id} className="rounded-md border p-3" data-testid={`mievento-ticket-${event.id}`}>
                    <p className="text-sm font-medium">{event.label}</p>
                    {event.note && <p className="text-xs text-muted-foreground">{event.note}</p>}
                    <RadioGroup
                      className="mt-2 flex flex-wrap gap-4"
                      value={entry?.status ?? ""}
                      onValueChange={(v) => setStatus(event.id, v as MieventoTicketStatusValue)}
                    >
                      {MIEVENTO_TICKET_STATUSES.map((status) => (
                        <div key={status} className="flex items-center gap-2">
                          <RadioGroupItem value={status} id={`${event.id}-${status}`} data-testid={`radio-ticket-${event.id}-${status}`} />
                          <Label htmlFor={`${event.id}-${status}`} className="text-sm font-normal">
                            {MIEVENTO_TICKET_STATUS_LABEL[status]}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                    <Textarea
                      className="mt-2"
                      placeholder="Anything that would help you decide whether to go? (optional)"
                      value={entry?.note ?? ""}
                      onChange={(e) => setNote(event.id, e.target.value)}
                      data-testid={`textarea-ticket-note-${event.id}`}
                    />
                  </div>
                );
              })}
            </div>
            {error && <p className="text-sm text-destructive" data-testid="text-mievento-tickets-error">{error}</p>}
            <DialogFooter>
              <Button size="sm" disabled={saving} onClick={save} data-testid="button-mievento-tickets-save">
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save my ticket status
              </Button>
            </DialogFooter>
          </div>
        ) : linkSent ? (
          <p className="flex items-center gap-2 text-sm text-primary" data-testid="text-mievento-tickets-link-sent">
            <Mail className="h-4 w-4" /> Check {email} for a sign-in link, then come back to update your status.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="mievento-tickets-email">Your email</Label>
              <Input
                id="mievento-tickets-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                data-testid="input-mievento-tickets-email"
              />
            </div>
            {error && <p className="text-sm text-destructive" data-testid="text-mievento-tickets-error">{error}</p>}
            <Button size="sm" disabled={sending} onClick={sendLink} data-testid="button-mievento-tickets-send-link">
              {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Mail className="mr-1 h-4 w-4" />}
              Send me a sign-in link
            </Button>
            {isDemo && <p className="text-xs text-muted-foreground">Demo mode: no real email is sent while showing sample data.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
