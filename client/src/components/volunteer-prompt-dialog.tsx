import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { HeartHandshake } from "lucide-react";

interface VolunteerPromptDialogProps {
  /** "support" is asked first; "lead" follows right after, regardless of the support answer. */
  step: "support" | "lead" | null;
  onAnswer: (yes: boolean) => void;
}

/**
 * Two sequential yes/no prompts fired the first time a classmate taps any
 * interest pill on the entry form (not after Save). Answers are stored on
 * their `Person` row as `volunteer_support` / `volunteer_lead` so organizers
 * know who's willing to help run a cluster's chat group.
 */
export default function VolunteerPromptDialog({ step, onAnswer }: VolunteerPromptDialogProps) {
  const open = step !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onAnswer(false); }}>
      <DialogContent className="max-w-sm" data-testid="dialog-volunteer-prompt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5" />
            {step === "support" ? "Help plan this one?" : "Lead the group?"}
          </DialogTitle>
          <DialogDescription>
            {step === "support"
              ? "Would you like to support a chat group in planning this activity?"
              : "Would you also like to lead or chair that chat group?"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onAnswer(false)} data-testid={`button-volunteer-${step}-no`}>
            No thanks
          </Button>
          <Button onClick={() => onAnswer(true)} data-testid={`button-volunteer-${step}-yes`}>
            Yes, count me in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
