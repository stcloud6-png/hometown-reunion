import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, KeyRound, Loader2, Mail, ShieldCheck, Users } from "lucide-react";
import { EMAIL_PATTERN, friendlyError } from "@/lib/reunion";
import type { MemberDirectoryRow } from "@/lib/use-reunion-data";

function formatUpdated(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Admin sign-in. The PIN only opens the Maintenance screens; real admin rights
 * (member emails, editing plans/settings) come from an emailed sign-in link and
 * are checked by the database. The UI never reveals which emails are admins.
 */
export function AdminAccessPanel({
  isAdmin,
  sessionEmail,
  isTestAccount,
  onSendSignInLink,
  onSignOut,
}: {
  isAdmin: boolean;
  sessionEmail: string | null;
  isTestAccount: boolean;
  onSendSignInLink: (email: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAdmin) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm" data-testid="admin-status-verified">
        <span className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-[hsl(142_70%_32%)]" /> Admin access verified
        </span>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onSignOut} data-testid="button-admin-sign-out">
          Sign out
        </Button>
      </div>
    );
  }

  async function send() {
    const target = email.trim();
    if (!EMAIL_PATTERN.test(target)) {
      setError("Enter a valid email.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSendSignInLink(target);
      setSent(true);
    } catch (e) {
      setError(friendlyError(e, "Could not send the sign-in link."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="admin-sign-in">
      <p className="text-sm font-medium">Admin sign-in</p>
      <p className="text-xs text-muted-foreground">
        {sessionEmail && !isTestAccount
          ? "This sign-in doesn't have admin access. Enter an admin email to get a sign-in link."
          : "Enter your admin email. We'll send a sign-in link; admin tools unlock after you open it."}
      </p>
      {sent ? (
        <p className="text-sm" data-testid="text-admin-link-sent">
          Check your inbox for the sign-in link, then open it on this device.
        </p>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="off"
            className="h-9"
            data-testid="input-admin-email"
          />
          <Button type="submit" size="sm" disabled={sending} data-testid="button-admin-send-link">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="mr-1 h-4 w-4" />}
            {sending ? "" : "Send link"}
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Private test account sign-in (email + password, no email verification). */
export function TestAccountPanel({
  isTestAccount,
  sessionEmail,
  onSignIn,
  onSignOut,
}: {
  isTestAccount: boolean;
  sessionEmail: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isTestAccount) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-3 text-sm" data-testid="test-account-active">
        <p className="flex items-center gap-2 font-medium">
          <KeyRound className="h-4 w-4" /> Signed in as the test account
        </p>
        <p className="text-xs text-muted-foreground">
          Signed in as <span className="font-medium">{sessionEmail}</span>. Entries you make are hidden from all members and left out of group results.
        </p>
        <Button variant="outline" size="sm" onClick={onSignOut} data-testid="button-test-sign-out">
          Sign out of test account
        </Button>
      </div>
    );
  }

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter the test email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSignIn(email.trim(), password);
      setPassword("");
    } catch (e) {
      setError(friendlyError(e, "Sign-in failed. Check the email and password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-2 rounded-md border border-dashed p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      data-testid="test-account-sign-in"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4" /> Test account sign-in
      </p>
      <p className="text-xs text-muted-foreground">Try the app as a regular member. Test entries stay hidden from everyone else.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="input-test-email" className="text-xs">Email</Label>
          <Input id="input-test-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="h-9" data-testid="input-test-email" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="input-test-password" className="text-xs">Password</Label>
          <Input id="input-test-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-9" data-testid="input-test-password" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={busy} data-testid="button-test-sign-in">
        {busy ? "Signing in…" : "Sign in as test account"}
      </Button>
    </form>
  );
}

/** Admin-only popup listing every signed-up member's name and email. */
export function MemberDirectoryDialog({
  open,
  onOpenChange,
  isAdmin,
  onFetch,
  onSetHidden,
  adminPanel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onFetch: () => Promise<MemberDirectoryRow[]>;
  onSetHidden?: (id: string, hidden: boolean) => Promise<void>;
  adminPanel: React.ReactNode;
}) {
  const [rows, setRows] = useState<MemberDirectoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isAdmin) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    onFetch()
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e, "Could not load the member directory."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isAdmin, onFetch]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCopied(false);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows ?? [];
    if (!q) return list;
    return list.filter((r) => r.name.toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q));
  }, [rows, query]);

  const counted = (r: MemberDirectoryRow) => !r.is_test && !r.hidden;
  const memberCount = (rows ?? []).filter(counted).length;
  const hiddenCount = (rows ?? []).length - memberCount;

  async function toggleHidden(r: MemberDirectoryRow) {
    if (!onSetHidden) return;
    setBusyId(r.id);
    setError(null);
    try {
      await onSetHidden(r.id, !r.hidden);
      setRows((prev) => (prev ?? []).map((x) => (x.id === r.id ? { ...x, hidden: !r.hidden } : x)));
    } catch (e) {
      setError(friendlyError(e, "Could not update that entry."));
    } finally {
      setBusyId(null);
    }
  }

  async function copyEmails() {
    const emails = (rows ?? []).filter((r) => counted(r) && r.email).map((r) => r.email as string);
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      setCopied(true);
    } catch {
      setError("Copy isn't available in this browser.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0" data-testid="member-directory-dialog">
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="space-y-1 border-b p-5 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Member directory
            </DialogTitle>
            <DialogDescription>
              {isAdmin ? `${memberCount} signed-up member${memberCount === 1 ? "" : "s"}${hiddenCount ? ` (+${hiddenCount} hidden from group results)` : ""}. Visible to admins only.` : "Admin sign-in is required to see member names and emails."}
            </DialogDescription>
          </DialogHeader>

          {!isAdmin ? (
            <div className="p-5">{adminPanel}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" className="h-9 min-w-0 flex-1" data-testid="input-directory-search" />
                <Button variant="outline" size="sm" onClick={() => void copyEmails()} disabled={!rows?.length} data-testid="button-copy-emails">
                  <Copy className="mr-1 h-4 w-4" /> {copied ? "Copied" : "Copy emails"}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
                {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
                {!loading && !error && filtered.length === 0 && <p className="text-sm text-muted-foreground">No members found.</p>}
                {!loading && filtered.length > 0 && (
                  <table className="w-full text-sm" data-testid="table-member-directory">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-semibold">Name</th>
                        <th className="py-2 pr-3 font-semibold">Email</th>
                        <th className="hidden py-2 pr-3 font-semibold sm:table-cell">Status</th>
                        <th className="hidden py-2 pr-3 font-semibold sm:table-cell">Updated</th>
                        {onSetHidden && <th className="py-2 text-right font-semibold">Results</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} className={`border-b last:border-0 align-top ${counted(r) ? "" : "text-muted-foreground"}`} data-testid={`row-member-${r.id}`}>
                          <td className="py-2 pr-3 font-medium">
                            {r.name}
                            {r.is_test && <Badge variant="outline" className="ml-2 text-[10px]">Test / admin</Badge>}
                            {!r.is_test && r.hidden && <Badge variant="outline" className="ml-2 text-[10px]">Hidden</Badge>}
                          </td>
                          <td className="break-all py-2 pr-3">
                            {r.email ? (
                              <a href={`mailto:${r.email}`} className="text-primary underline-offset-2 hover:underline">{r.email}</a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="hidden py-2 pr-3 text-muted-foreground sm:table-cell">
                            {r.attending === true ? "Count me in" : r.attending === false ? "Not sure yet" : "—"}
                          </td>
                          <td className="hidden whitespace-nowrap py-2 pr-3 text-muted-foreground sm:table-cell">{formatUpdated(r.updated_at)}</td>
                          {onSetHidden && (
                            <td className="py-1.5 text-right">
                              {r.is_test ? (
                                <span className="text-xs text-muted-foreground">Always hidden</span>
                              ) : (
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busyId === r.id} onClick={() => void toggleHidden(r)} data-testid={`button-toggle-hidden-${r.id}`}>
                                  {r.hidden ? "Show" : "Hide"}
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
