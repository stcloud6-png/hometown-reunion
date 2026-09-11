import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Anchor, CheckCircle2, Loader2, Mail } from "lucide-react";
import { EMAIL_PATTERN, type Person } from "@/lib/reunion";

interface YachtPaymentDialogProps {
  isDemo: boolean;
  sessionEmail: string | null;
  myPerson: Person | null;
  onSendSignInLink: (email: string) => Promise<void>;
  onConfirmPaid: (paid: boolean) => Promise<void>;
}

/**
 * Self-serve "I paid for the Yacht Club dinner" popup. Marking the flag is an
 * update to an existing person row, which Supabase RLS only allows an
 * authenticated user to do on their OWN row (email match) — so the dialog
 * gates the confirm step behind the same magic-link sign-in used by the
 * Event Organizer invite flow, rather than allowing anonymous writes.
 */
export default function YachtPaymentDialog({ isDemo, sessionEmail, myPerson, onSendSignInLink, onConfirmPaid }: YachtPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(sessionEmail ?? "");
  const [linkSent, setLinkSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedIn = Boolean(sessionEmail);
  const alreadyPaid = Boolean(myPerson?.yacht_paid);

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

  async function confirm(paid: boolean) {
    setConfirming(true);
    setError(null);
    try {
      await onConfirmPaid(paid);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your payment status.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setLinkSent(false); setError(null); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant={alreadyPaid ? "outline" : "secondary"} data-testid="button-open-yacht-payment">
          <Anchor className="mr-1 h-4 w-4" /> {alreadyPaid ? "Update Yacht Club payment" : "Mark Yacht Club payment"}
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-yacht-payment">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Anchor className="h-5 w-5" /> Yacht Club Dinner &amp; Dance
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Everyone's slot is already reserved for Wed, Jan 20. Pay your Event Organizer directly (cash,
            Venmo, etc.) for whatever amount they've told you, then confirm it here so the group total stays
            accurate.
          </p>
        </DialogHeader>

        {signedIn ? (
          <div className="space-y-4">
            <p className="text-sm" data-testid="text-yacht-signed-in-as">
              Signed in as <span className="font-medium">{sessionEmail}</span>
            </p>
            {alreadyPaid ? (
              <p className="flex items-center gap-2 text-sm text-primary" data-testid="text-yacht-already-paid">
                <CheckCircle2 className="h-4 w-4" /> You're marked as paid.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Not marked as paid yet.</p>
            )}
            {error && <p className="text-sm text-destructive" data-testid="text-yacht-error">{error}</p>}
            <DialogFooter className="gap-2 sm:justify-start">
              {alreadyPaid ? (
                <Button variant="outline" size="sm" disabled={confirming} onClick={() => confirm(false)} data-testid="button-yacht-undo">
                  {confirming && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Undo — not paid after all
                </Button>
              ) : (
                <Button size="sm" disabled={confirming} onClick={() => confirm(true)} data-testid="button-yacht-confirm-paid">
                  {confirming && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Yes, I've paid
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : linkSent ? (
          <p className="flex items-center gap-2 text-sm text-primary" data-testid="text-yacht-link-sent">
            <Mail className="h-4 w-4" /> Check {email} for a sign-in link, then come back to confirm.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="yacht-email">Your email</Label>
              <Input
                id="yacht-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                data-testid="input-yacht-email"
              />
            </div>
            {error && <p className="text-sm text-destructive" data-testid="text-yacht-error">{error}</p>}
            <Button size="sm" disabled={sending} onClick={sendLink} data-testid="button-yacht-send-link">
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
