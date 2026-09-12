import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Settings } from "lucide-react";
import { MAINTENANCE_PIN, type ClusterThresholds, CLUSTER_THRESHOLDS } from "@/lib/reunion";

interface SettingsPopoverProps {
  showPills: boolean;
  onShowPillsChange: (next: boolean) => void;
  unlocked: boolean;
  onUnlockedChange: (next: boolean) => void;
  thresholds?: ClusterThresholds;
  onThresholdsChange?: (next: ClusterThresholds) => Promise<void> | void;
}

/**
 * Global settings/gear popover, lifted into the header so it's reachable from
 * every tab: the "interest pills" filter toggle plus the Maintenance PIN
 * unlock gate (PIN 3817). A correct PIN opens the Maintenance Settings dialog
 * where the shared interest-cluster thresholds can be tuned — saved to the
 * `app_settings` table so changes apply immediately for everyone, not just
 * this browser.
 */
export default function SettingsPopover({
  showPills,
  onShowPillsChange,
  unlocked,
  onUnlockedChange,
  thresholds = CLUSTER_THRESHOLDS,
  onThresholdsChange,
}: SettingsPopoverProps) {
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [draft, setDraft] = useState<ClusterThresholds>(thresholds);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settingsDialogOpen) setDraft(thresholds);
  }, [settingsDialogOpen, thresholds]);

  function submitPin() {
    if (pinInput === MAINTENANCE_PIN) {
      onUnlockedChange(true);
      setPinError(false);
      setPinDialogOpen(false);
      setPinInput("");
      setSettingsDialogOpen(true);
    } else {
      setPinError(true);
    }
  }

  async function saveThresholds() {
    setSaving(true);
    try {
      await onThresholdsChange?.(draft);
      setSettingsDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function draftField(key: keyof ClusterThresholds, value: string) {
    const n = Number(value);
    setDraft((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : prev[key] }));
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
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setSettingsDialogOpen(true)}
                data-testid="button-open-maintenance-settings"
              >
                Settings
              </Button>
              <Switch id="toggle-maintenance" checked={unlocked} onCheckedChange={onUnlockedChange} data-testid="settings-maintenance-switch" />
            </div>
          ) : (
            <Dialog
              open={pinDialogOpen}
              onOpenChange={(open) => {
                setPinDialogOpen(open);
                if (!open) {
                  setPinInput("");
                  setPinError(false);
                }
              }}
            >
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

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent data-testid="maintenance-settings-dialog">
          <DialogHeader>
            <DialogTitle>Maintenance settings</DialogTitle>
            <DialogDescription>
              Limits for the interest-cluster section. Changes apply immediately for everyone who opens the Group Dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="threshold-public-top">Clusters shown to group (top)</Label>
              <Input
                id="threshold-public-top"
                type="number"
                min={0}
                value={draft.publicTop}
                onChange={(e) => draftField("publicTop", e.target.value)}
                data-testid="input-threshold-public-top"
              />
              <p className="text-xs text-muted-foreground">The dashboard publicly shows the top N interest clusters.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="threshold-public-min">Feature all above N interest</Label>
              <Input
                id="threshold-public-min"
                type="number"
                min={0}
                value={draft.publicMinInterest}
                onChange={(e) => draftField("publicMinInterest", e.target.value)}
                data-testid="input-threshold-public-min"
              />
              <p className="text-xs text-muted-foreground">Any cluster with more interested than this is always shown publicly, even outside the top N.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="threshold-candidate">Sub-event candidate at</Label>
              <Input
                id="threshold-candidate"
                type="number"
                min={0}
                value={draft.candidateAt}
                onChange={(e) => draftField("candidateAt", e.target.value)}
                data-testid="input-threshold-candidate"
              />
              <p className="text-xs text-muted-foreground">Interested count at which a cluster becomes ready to propose dates.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="threshold-spinoff">Spin-off candidate at</Label>
              <Input
                id="threshold-spinoff"
                type="number"
                min={0}
                value={draft.spinoffAt}
                onChange={(e) => draftField("spinoffAt", e.target.value)}
                data-testid="input-threshold-spinoff"
              />
              <p className="text-xs text-muted-foreground">Interested count at which the group should consider planning a second session.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSettingsDialogOpen(false)} data-testid="button-cancel-maintenance-settings">
              Cancel
            </Button>
            <Button onClick={saveThresholds} disabled={saving} data-testid="button-save-maintenance-settings">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Popover>
  );
}
