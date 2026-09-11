import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { BASE_ACTIVITIES, EMAIL_PATTERN } from "@/lib/reunion";
import { supabaseAuth } from "@/lib/reunion";

/**
 * Landing page for the "invite a lead organizer" link, e.g.
 * #/lead-invite?email=someone@example.com&cluster=napoli
 *
 * On the live site this auto-sends a magic-link sign-in email the moment the
 * page mounts, IF an email query param is present — so the invited organizer
 * doesn't have to type anything. During local QA/testing we must not trigger
 * that real send, so it is gated behind `autoSend` (defaulted true only when
 * NOT running under the stub/test flag).
 */
interface LeadInviteProps {
  autoSend?: boolean;
}

function useQueryParams() {
  const [params, setParams] = useState<URLSearchParams>(() => new URLSearchParams(window.location.hash.split("?")[1] ?? ""));
  useEffect(() => {
    const onHashChange = () => setParams(new URLSearchParams(window.location.hash.split("?")[1] ?? ""));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return params;
}

const STUB = import.meta.env.VITE_STUB_DATA === "true";

export default function LeadInvite({ autoSend = !STUB }: LeadInviteProps) {
  const params = useQueryParams();
  const emailParam = params.get("email") ?? "";
  const clusterParam = params.get("cluster") ?? "";
  const activityLabel = BASE_ACTIVITIES.find((a) => a.id === clusterParam)?.label ?? clusterParam;

  const [email, setEmail] = useState(emailParam);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (emailParam && EMAIL_PATTERN.test(emailParam) && autoSend && status === "idle") {
      send(emailParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailParam, autoSend]);

  async function send(target: string) {
    setStatus("sending");
    setError(null);
    try {
      await supabaseAuth.sendMagicLink(target);
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not send the sign-in link.");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full" data-testid="card-lead-invite">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Become the Event Organizer
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {activityLabel
              ? `You've been invited to organize "${activityLabel}" for the CZR BHS87 Reunion.`
              : "You've been invited to organize an activity for the CZR BHS87 Reunion."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "sent" ? (
            <p className="flex items-center gap-2 text-sm text-primary" data-testid="text-invite-sent">
              <Mail className="h-4 w-4" /> Check {email} for a sign-in link to confirm.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Your email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-invite-email"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" data-testid="text-invite-error">
                  {error}
                </p>
              )}
              <Button
                className="w-full"
                disabled={status === "sending" || !EMAIL_PATTERN.test(email)}
                onClick={() => send(email)}
                data-testid="button-send-invite"
              >
                {status === "sending" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Send me a sign-in link
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
