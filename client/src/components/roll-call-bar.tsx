import { Anchor, CalendarHeart, ClipboardCheck, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import YachtPaymentDialog from "@/components/yacht-payment-dialog";
import MieventoDialog from "@/components/mievento-dialog";
import MieventoTicketDialog from "@/components/mievento-ticket-dialog";
import {
  MIEVENTO_INTENT_LABEL,
  type MieventoTicketEntry,
  type Person,
  mieventoDays,
  mieventoShoppingEvents,
  mieventoTicketTally,
} from "@/lib/reunion";

interface RollCallBarProps {
  people: Person[];
  isDemo: boolean;
  sessionEmail: string | null;
  myPerson: Person | null;
  onSendSignInLink: (email: string) => Promise<void>;
  onConfirmYachtPaid: (paid: boolean) => Promise<void>;
  onSaveMieventoIntents: (intents: Record<string, string>) => Promise<void>;
  onSaveMieventoTicketStatus: (status: Record<string, MieventoTicketEntry>) => Promise<void>;
  /** "header" sits directly under the main site header on the Group Dashboard.
   * "footer" is the compact duplicate shown on the My Application tab after sign-in + save. */
  variant?: "header" | "footer";
}

/**
 * Compact, non-sticky Roll Call bar. Visible to every visitor — the three
 * action buttons (Yacht Club pay / MiEvento response / ticket status) each
 * show independently only when the viewer is signed in AND that specific
 * item is still outstanding for them.
 */
export default function RollCallBar({
  people,
  isDemo,
  sessionEmail,
  myPerson,
  onSendSignInLink,
  onConfirmYachtPaid,
  onSaveMieventoIntents,
  onSaveMieventoTicketStatus,
  variant = "header",
}: RollCallBarProps) {
  const attending = people.filter((p) => p.attending === true);
  const notSure = people.filter((p) => p.attending === false);
  const unanswered = people.filter((p) => p.attending == null);
  const supportVolunteers = people.filter((p) => p.volunteer_support);
  const leadVolunteers = people.filter((p) => p.volunteer_lead);
  const yachtPaid = people.filter((p) => p.yacht_paid);

  const days = mieventoDays();
  const responded = people.filter((p) => p.mievento_intents && Object.keys(p.mievento_intents).length > 0);
  const veryCount = days.reduce(
    (sum, d) => sum + people.filter((p) => p.mievento_intents?.[d.iso] === "very").length,
    0,
  );

  const ticketEvents = mieventoShoppingEvents();
  const ticketTallies = ticketEvents.map((e) => mieventoTicketTally(people, e.id));
  const ticketsPurchased = ticketTallies.reduce((sum, t) => sum + t.purchased, 0);
  const ticketsResearching = ticketTallies.reduce((sum, t) => sum + t.researching, 0);

  const signedIn = Boolean(sessionEmail);
  const alreadyPaidYacht = Boolean(myPerson?.yacht_paid);
  const alreadyResponded = Boolean(myPerson?.mievento_intents && Object.keys(myPerson.mievento_intents).length > 0);
  const alreadyTicketed = Boolean(
    myPerson?.mievento_ticket_status && Object.keys(myPerson.mievento_ticket_status).length > 0,
  );

  const showYachtButton = signedIn && !alreadyPaidYacht;
  const showMieventoButton = signedIn && !alreadyResponded;
  const showTicketButton = signedIn && !alreadyTicketed;

  return (
    <div
      className={cn(
        "w-full bg-muted/30",
        variant === "header" ? "border-b" : "rounded-md border",
      )}
      data-testid={variant === "header" ? "bar-roll-call-header" : "bar-roll-call-footer"}
    >
      <div className={cn(variant === "header" ? "mx-auto max-w-5xl px-4 py-2.5" : "px-3 py-2.5")}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardCheck className="h-4 w-4" /> Roll call
          </span>
          <span className="text-xs text-muted-foreground">
            For those who have registered on this Planning App/Site, who's confirmed, who's helping, who's paid for
            the Yacht Club dinner, and MiEvento interest so far.
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-semibold text-primary">{attending.length}</span>
            <span className="text-muted-foreground">
              count me in <span className="text-[10px]">({notSure.length} not sure · {unanswered.length} unanswered)</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-base font-semibold text-primary">{leadVolunteers.length}</span>
            <span className="text-muted-foreground">
              volunteer leads <span className="text-[10px]">({supportVolunteers.length} helping)</span>
            </span>
          </div>

          <div className="flex flex-wrap items-start gap-1.5">
            <Anchor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-base font-semibold text-primary">{yachtPaid.length}</span>
            <span className="text-muted-foreground">Yacht Club paid</span>
            {showYachtButton && (
              <YachtPaymentDialog
                isDemo={isDemo}
                sessionEmail={sessionEmail}
                myPerson={myPerson}
                onSendSignInLink={onSendSignInLink}
                onConfirmPaid={onConfirmYachtPaid}
              />
            )}
          </div>

          <div className="flex flex-wrap items-start gap-1.5">
            <CalendarHeart className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-base font-semibold text-primary">{responded.length}</span>
            <span className="text-muted-foreground">
              MiEvento responses <span className="text-[10px]">({veryCount} "{MIEVENTO_INTENT_LABEL.very.toLowerCase()}" picks)</span>
            </span>
            {showMieventoButton && (
              <MieventoDialog
                isDemo={isDemo}
                sessionEmail={sessionEmail}
                myPerson={myPerson}
                onSendSignInLink={onSendSignInLink}
                onSaveIntents={onSaveMieventoIntents}
              />
            )}
          </div>

          <div className="flex flex-wrap items-start gap-1.5">
            <Ticket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="text-base font-semibold text-primary">{ticketsPurchased}</span>
            <span className="text-muted-foreground">
              tickets purchased <span className="text-[10px]">({ticketsResearching} looking into it)</span>
            </span>
            {showTicketButton && (
              <MieventoTicketDialog
                isDemo={isDemo}
                sessionEmail={sessionEmail}
                myPerson={myPerson}
                onSendSignInLink={onSendSignInLink}
                onSaveTicketStatus={onSaveMieventoTicketStatus}
                compact
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
