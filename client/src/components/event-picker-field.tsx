import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface EventPickerOption {
  id: string;
  label: string;
  note?: string;
}

interface EventPickerFieldProps {
  value: string;
  options: EventPickerOption[];
  onSelect: (id: string) => void;
  /** Extra class for the trigger/button, e.g. per-event category color. */
  triggerClassName?: string;
  /** className applied to each option, given its id — used for category coloring in the desktop dropdown. */
  optionClassName?: (id: string) => string | undefined;
  placeholder?: string;
  testId?: string;
  dialogTitle?: string;
}

/**
 * Event-choice control used inside the time-slot table. On desktop this is the
 * normal compact Select dropdown (unchanged). On mobile, tapping the trigger
 * opens a full dialog listing every option as a large, readable row — the
 * native/compact dropdown is too cramped to read full MiEvento event names
 * on a phone screen.
 */
export default function EventPickerField({
  value,
  options,
  onSelect,
  triggerClassName,
  optionClassName,
  placeholder = "Pick event",
  testId,
  dialogTitle = "Which event?",
}: EventPickerFieldProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.id === value);

  if (!isMobile) {
    return (
      <Select value={value} onValueChange={onSelect}>
        <SelectTrigger className={triggerClassName} data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id} className={optionClassName?.(o.id)}>
              {o.note ? `${o.label} (${o.note})` : o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testId}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-md border px-1.5 text-left text-[10px]",
          triggerClassName,
        )}
      >
        <span className="truncate">{selected ? selected.label : "Pick"}</span>
        <span className="ml-1 shrink-0 text-muted-foreground">▾</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md" data-testid={testId ? `${testId}-dialog` : undefined}>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {options.map((o) => (
              <Button
                key={o.id}
                type="button"
                variant={o.id === value ? "secondary" : "outline"}
                className="h-auto w-full justify-start whitespace-normal px-3 py-2.5 text-left"
                data-testid={testId ? `${testId}-option-${o.id}` : undefined}
                onClick={() => {
                  onSelect(o.id);
                  setOpen(false);
                }}
              >
                <span className="flex flex-col items-start gap-0.5">
                  <span className="font-medium">{o.label}</span>
                  {o.note && <span className="text-xs text-muted-foreground">{o.note}</span>}
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
