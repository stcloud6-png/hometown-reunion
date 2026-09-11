import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Settings } from "lucide-react";
import { MAINTENANCE_PIN } from "@/lib/reunion";

interface SettingsPopoverProps {
  showPills: boolean;
  onShowPillsChange: (next: boolean) => void;
  unlocked: boolean;
  onUnlockedChange: (next: boolean) => void;
}

/**
 * Global settings/gear popover, lifted into the header so it's reachable from
 * every tab: the "interest pills" filter toggle plus the Maintenance PIN
 * unlock gate (PIN 3817).
 */
export default function SettingsPopover({ showPills, onShowPillsChange, unlocked, onUnlockedChange }: SettingsPopoverProps) {
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  function submitPin() {
    if (pinInput === MAINTENANCE_PIN) {
      onUnlockedChange(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings" data-testid="button-settings">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="toggle-pills">Interest pills</Label>
          <Switch id="toggle-pills" checked={showPills} onCheckedChange={onShowPillsChange} data-testid="settings-pills-switch" />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="toggle-maintenance">Maintenance</Label>
          {unlocked ? (
            <Switch id="toggle-maintenance" checked={unlocked} onCheckedChange={onUnlockedChange} data-testid="settings-maintenance-switch" />
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-open-maintenance-pin">
                  Unlock
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="maintenance-pin-dialog">
                <DialogHeader>
                  <DialogTitle>Enter maintenance PIN</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center gap-3 py-2">
                  <InputOTP maxLength={4} value={pinInput} onChange={setPinInput} data-testid="maintenance-pin-input">
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                    </InputOTPGroup>
                  </InputOTP>
                  {pinError && (
                    <p className="text-sm text-destructive" data-testid="maintenance-pin-error">
                      Incorrect PIN.
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={submitPin} data-testid="maintenance-pin-submit">
                    Unlock
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
