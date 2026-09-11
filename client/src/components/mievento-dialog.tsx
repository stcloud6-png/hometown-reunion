import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarHeart, Loader2, Mail } from "lucide-react";
import {
  EMAIL_PATTERN,
  MIEVENTO_INTENTS,
  MIEVENTO_INTENT_LABEL,
  mieventoDays,
  type MieventoIntent,
  type Person,
} from "@/lib/reunion";

interface MieventoDialogProps {
  isDemo: boolean;
  sessionEmail: string | null;
  myPerson: Person | null;
  onSendSignInLink: (email: string) => Promise<void>;
  onSaveIntents: (intents: Record<string, string>) => Promise<void>;
}

/**
 * Self-serve interest triage for the core MiEvento week (Jan 17–24): each
 * signed-in respondent picks a per-day interest level, stored as
 * `people.mievento_intents` (JSONB, keyed by ISO date). Gated behind the
 * same magic-link sign-in as the Yacht Club dialog, for the same RLS reason
 * — updating an existing row requires an authenticated email match.
 */
export default function MieventoDialog({ isDemo, sessionEmail, myPerson, onSendSignInLink, onSaveIntents }: MieventoDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(sessionEmail ?? "");
  const [linkSent, setLinkSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, MieventoIntent>>({});
  const days = mieventoDays();

  useEffect(() => {
    if (open) setChoices((myPerson?.mievento_intents as Record<string, MieventoIntent>) ?? {});
  }, [open, myPerson]);

  const signedIn = Boolean(sessionEmail);

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
      await onSaveIntents(choices);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your MiEvento interest.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setLinkSent(false); setError(null); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" data-testid="button-open-mievento">
          <CalendarHeart className="mr-1 h-4 w-4" /> MiEvento interest
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="dialog-mievento">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarHeart className="h-5 w-5" /> MiEvento week interest
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Jan 17–24 is set aside for MiEvento. Tell us how interested you are for each day, so organizers
            know how much to plan around it.
          </p>
        </DialogHeader>

        {signedIn ? (
          <div className="space-y-4">
            <p className="text-sm" data-testid="text-mievento-signed-in-as">
              Signed in as <span className="font-medium">{sessionEmail}</span>
            </p>
            <div className="space-y-4">
              {days.map((day) => (
                <div key={day.iso} className="rounded-md border p-3" data-testid={`mievento-day-${day.iso}`}>
                  <p className="text-sm font-medium">{day.label}</p>
                  <RadioGroup
                    className="mt-2 flex flex-wrap gap-4"
                    value={choices[day.iso] ?? ""}
                    onValueChange={(v) => setChoices((prev) => ({ ...prev, [day.iso]: v as MieventoIntent }))}
                  >
                    {MIEVENTO_INTENTS.map((level) => (
                      <div key={level} className="flex items-center gap-2">
                        <RadioGroupItem value={level} id={`${day.iso}-${level}`} data-testid={`radio-${day.iso}-${level}`} />
                        <Label htmlFor={`${day.iso}-${level}`} className="text-sm font-normal">
                          {MIEVENTO_INTENT_LABEL[level]}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-destructive" data-testid="text-mievento-error">{error}</p>}
            <DialogFooter>
              <Button size="sm" disabled={saving} onClick={save} data-testid="button-mievento-save">
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save my interest
              </Button>
            </DialogFooter>
          </div>
        ) : linkSent ? (
          <p className="flex items-center gap-2 text-sm text-primary" data-testid="text-mievento-link-sent">
            <Mail className="h-4 w-4" /> Check {email} for a sign-in link, then come back to set your interest.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="mievento-email">Your email</Label>
              <Input
                id="mievento-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                data-testid="input-mievento-email"
              />
            </div>
            {error && <p className="text-sm text-destructive" data-testid="text-mievento-error">{error}</p>}
            <Button size="sm" disabled={sending} onClick={sendLink} data-testid="button-mievento-send-link">
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
