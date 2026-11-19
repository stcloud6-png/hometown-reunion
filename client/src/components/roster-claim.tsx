import { useMemo, useState } from "react";
import { CheckCircle2, LogIn, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMAIL_PATTERN } from "@/lib/reunion";
import { writePendingClaim, type MyRoster, type RosterEntry } from "@/lib/use-reunion-data";

function norm(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Step 1 for anyone not signed in: find your name on the class list, give an email, and we
 * send a one-time link. Clicking it signs you in and attaches the email to that name, so
 * nobody can claim someone else's name. Not on the list? Ask to be added (organizers check
 * new names against the yearbook).
 */
export function RosterClaim({ roster, onSendSignInLink, linkError }: {
  roster: RosterEntry[];
  onSendSignInLink: (email: string) => Promise<void>;
  linkError?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<RosterEntry | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    return roster
      .filter((r) => r.status !== "pending_review")
      .filter((r) => [r.display_name, ...r.search_names].some((n) => norm(n).split(" ").some((w) => w.startsWith(q)) || norm(n).includes(q)))
      .slice(0, 8);
  }, [query, roster]);

  async function send() {
    const typed = email.trim();
    if (!EMAIL_PATTERN.test(typed)) { setError("Enter a valid email address."); return; }
    if (!picked && !(newName && newName.trim().length >= 3)) { setError("Pick your name first."); return; }
    setError(null);
    setSending(true);
    try {
      writePendingClaim(picked ? { rosterId: picked.status === "unclaimed" ? picked.id : null, name: picked.display_name } : { rosterId: null, name: newName!.trim() });
      // A name someone already claimed isn't re-claimed: the link just signs them back in.
      if (picked && picked.status === "claimed") writePendingClaim(null);
      await onSendSignInLink(typed);
      setSentTo(typed);
    } catch {
      setError("Couldn't send the email just now. Please try again in a minute.");
    } finally {
      setSending(false);
    }
  }

  const chosenLabel = picked?.display_name ?? newName;

  return (
    <Card data-testid="card-roster-claim">
      <CardHeader>
        <CardTitle>Find your name</CardTitle>
        <p className="text-sm text-muted-foreground">
          Start typing your first or last name — maiden and married names both work.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {linkError && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{linkError}</p>}
        {!chosenLabel ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Mickelson or McQuary" className="pl-9" data-testid="input-roster-search" />
            </div>
            {matches.length > 0 && (
              <ul className="divide-y rounded-md border" data-testid="list-roster-matches">
                {matches.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setPicked(r)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted" data-testid={`roster-${r.id}`}>
                      <span className="font-medium">{r.display_name}</span>
                      {r.status === "claimed" && <span className="text-xs text-muted-foreground">already signed up — sign back in</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {norm(query).length >= 2 && (
              <button type="button" onClick={() => setNewName(query.trim())} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2" data-testid="button-not-on-list">
                <UserPlus className="h-4 w-4" /> I'm not on the list — add me
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /><strong>{chosenLabel}</strong>
              {newName && <span className="text-xs text-muted-foreground">(new — the organizers will confirm it)</span>}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setPicked(null); setNewName(null); setSentTo(null); }}>Change</Button>
          </div>
        )}
        {newName !== null && !picked && (
          <div className="space-y-2">
            <Label htmlFor="new-name">Your name as you'd like it shown</Label>
            <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="First Last (Maiden)" data-testid="input-new-name" />
          </div>
        )}
        {chosenLabel && !sentTo && (
          <div className="space-y-2 border-t pt-3">
            <Label htmlFor="claim-email">Your email</Label>
            <Input id="claim-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="input-claim-email" />
            <p className="text-xs text-muted-foreground">We'll email you a one-time sign-in link. Clicking it links this email to your name — no password needed.</p>
            <Button type="button" onClick={send} disabled={sending} data-testid="button-claim-send">
              <LogIn className="mr-1.5 h-4 w-4" /> {sending ? "Sending…" : "Email me my sign-in link"}
            </Button>
          </div>
        )}
        {sentTo && <p className="text-sm font-medium text-primary" data-testid="text-claim-sent">Check your inbox — we sent a sign-in link to {sentTo}. Open it on this device to continue.</p>}
        {error && <p className="text-sm text-destructive" data-testid="text-claim-error">{error}</p>}
      </CardContent>
    </Card>
  );
}

/** "Is this you?" — shown once to someone whose yearbook photo was only a suggested match. */
export function YearbookConfirm({ mine, onAnswer }: { mine: MyRoster; onAnswer: (yes: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (!mine.yearbook_name || mine.yearbook_confirmed || !mine.page || !mine.box) return null;
  const [x, y, w, h] = mine.box;
  const answer = async (yes: boolean) => { setBusy(true); try { await onAnswer(yes); } finally { setBusy(false); } };
  return (
    <Card className="border-primary/40" data-testid="card-yearbook-confirm">
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        {/* Crop of the portrait from the yearbook page. */}
        <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-md border bg-muted">
          <img
            src={`${import.meta.env.BASE_URL}yearbook/page-${String(mine.page).padStart(3, "0")}.jpg`}
            alt=""
            className="absolute max-w-none"
            style={{ width: `${(100 / w) * 100}%`, left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%`, height: `${(100 / h) * 100}%` }}
          />
        </div>
        <div className="min-w-[200px] flex-1 space-y-2">
          <p className="font-medium">Is this you in the '87 yearbook?</p>
          <p className="text-sm text-muted-foreground">{mine.yearbook_name}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => answer(true)} data-testid="button-yearbook-yes">Yes, that's me</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => answer(false)} data-testid="button-yearbook-no">No</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
