import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Trash2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AdminMissingPhoto, MissingPhoto, MyMissingPhoto, RosterEntry } from "@/lib/use-reunion-data";

const MAX_BYTES = 15 * 1024 * 1024; // before shrinking in the browser

function pickError(file: File | undefined): string | null {
  if (!file) return "Choose a photo first.";
  if (!/^image\//.test(file.type)) return "That file isn't a photo. Please pick a JPG or PNG.";
  if (file.size > MAX_BYTES) return "That photo is very large. Please pick one under 15 MB.";
  return null;
}

/** Watermark wording (neutral on purpose: nothing says anything about payment). */
export function watermarkText(v: string): string {
  if (v === "2026") return "Jan 2027";
  if (v === "2026 - Unconfirmed?") return "2027 \u2013 Soon?";
  return "2027 \u2013 Soon";
}

/** Same neutral wording as the yearbook watermarks — never says anything about payment. */
function WatermarkText({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="whitespace-nowrap font-sans text-sm font-bold leading-none text-[#ffd400] [text-shadow:0_0_2px_rgba(0,0,0,.9),0_1px_2px_rgba(0,0,0,.9)]">
      {watermarkText(value)}
    </span>
  );
}

/**
 * Yearbook pop-up: classmates who missed the senior photo shoot (or graduation), with the photo
 * they gave us. Public, approved photos only.
 */
export function MissingPhotosDialog({ open, onOpenChange, fetchPhotos, showWatermarks, showTitles = true, showRip = true, showHonorary = true }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchPhotos?: () => Promise<MissingPhoto[]>;
  showWatermarks: boolean;
  /** Follows the yearbook's Titles button: purple frame + label, as on the portraits. */
  showTitles?: boolean;
  /** Follows the yearbook's RIP button. */
  showRip?: boolean;
  /** Follows the yearbook's Honorary '87 button: gray frame + label. */
  showHonorary?: boolean;
}) {
  const [photos, setPhotos] = useState<MissingPhoto[] | null>(null);
  useEffect(() => {
    if (!open || !fetchPhotos) return;
    let cancelled = false;
    setPhotos(null);
    fetchPhotos().then((p) => { if (!cancelled) setPhotos(p); }).catch(() => { if (!cancelled) setPhotos([]); });
    return () => { cancelled = true; };
  }, [open, fetchPhotos]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto bg-[#f4ecd8]" data-testid="dialog-missing-photos">
        <DialogTitle className="font-serif text-2xl">Class of &rsquo;87 &mdash; Missing Photos</DialogTitle>
        <DialogDescription>
          Classmates who missed the senior portrait shoot or graduation, in the photos they shared with us.
        </DialogDescription>
        {photos === null ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading photos…</p>
        ) : photos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground" data-testid="text-missing-photos-empty">
            No photos yet. Missing from the yearbook? Sign in on the main page and add yours.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4" data-testid="list-missing-photos">
            {photos.map((p) => (
              <li key={p.id} className="flex flex-col items-center gap-1.5">
                <div className={cn("relative aspect-[4/5] w-full overflow-hidden bg-muted shadow-md",
                  showTitles && p.titles.length > 0 && "outline outline-[3px] outline-[#8e24aa]",
                  showHonorary && p.honorary && !(showTitles && p.titles.length > 0) && "outline outline-[3px] outline-[#8a8f98]")} data-testid={`missing-photo-${p.id}`}>
                  {p.url ? (
                    <img src={p.url} alt={p.display_name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#e8dfcb] text-[#8a7a5c]" data-testid="missing-photo-placeholder">
                      <Camera className="h-8 w-8" />
                      <span className="text-[11px] font-medium">Photo coming soon</span>
                    </div>
                  )}
                  {showTitles && p.titles.length > 0 && (
                    <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-px" data-testid="missing-photo-titles">
                      {p.titles.map((t) => (
                        <span key={t} className="w-full truncate bg-[#8e24aa] px-1 py-0.5 text-center font-sans text-[11px] font-bold leading-tight text-white">{t}</span>
                      ))}
                    </div>
                  )}
                  {showHonorary && p.honorary && (
                    <div className="absolute inset-x-0 top-0 flex justify-center" data-testid="missing-photo-honorary">
                      <span className="w-full bg-[#8a8f98] px-1 py-0.5 text-center font-sans text-[11px] font-bold leading-tight text-white">Honorary &rsquo;87</span>
                    </div>
                  )}
                  {showRip && p.rip && (
                    <div className="absolute inset-x-0 bottom-[8%] flex justify-center" data-testid="missing-photo-rip">
                      <span className="rip-text text-3xl leading-none">RIP</span>
                    </div>
                  )}
                  {showWatermarks && p.watermark && !p.rip && (
                    <div className="absolute inset-x-0 bottom-[8%] flex justify-center" data-testid="missing-photo-watermark">
                      <WatermarkText value={p.watermark} />
                    </div>
                  )}
                </div>
                <span className="text-center font-serif text-sm">{p.display_name}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Signed-in classmate with no senior portrait: add (or replace) their own photo. */
export function MissingPhotoUpload({ mine, onUpload }: { mine: MyMissingPhoto; onUpload: (file: File) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!mine.eligible) return null;

  async function onPick(file: File | undefined) {
    const problem = pickError(file);
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(true);
    try { await onUpload(file!); } catch { setError("Couldn't upload that photo just now. Please try again."); } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card data-testid="card-missing-photo-upload">
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        <div className="flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {mine.url ? <img src={mine.url} alt="Your photo" className="h-full w-full object-cover" /> : <Camera className="h-8 w-8 text-muted-foreground" />}
        </div>
        <div className="min-w-[220px] flex-1 space-y-2">
          {mine.status === "approved" ? (
            <p className="font-medium" data-testid="text-missing-photo-status">Your photo is in the yearbook&rsquo;s Missing Photos page.</p>
          ) : mine.status === "pending" ? (
            <p className="font-medium" data-testid="text-missing-photo-status">Thanks! Your photo will appear in the yearbook once an organizer OKs it.</p>
          ) : (
            <>
              <p className="font-medium">No senior portrait in the &rsquo;87 yearbook?</p>
              <p className="text-sm text-muted-foreground">
                Missed the photo shoot or graduation? Add a photo of yourself and it will appear on the yearbook&rsquo;s
                Missing Photos page, after a quick check by the organizers.
              </p>
            </>
          )}
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} data-testid="input-missing-photo" />
          <Button size="sm" variant={mine.status ? "outline" : "default"} disabled={busy} onClick={() => input.current?.click()} data-testid="button-missing-photo-upload">
            <ImagePlus className="mr-1.5 h-4 w-4" /> {busy ? "Uploading…" : mine.status ? "Replace my photo" : "Add my photo"}
          </Button>
          {error && <p className="text-sm text-destructive" data-testid="text-missing-photo-error">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Admin: approve classmates' photos, remove one, or upload a photo for anyone on the list. */
export function AdminMissingPhotos({ roster, fetchAll, onAdd, onReview }: {
  roster: RosterEntry[];
  fetchAll: () => Promise<AdminMissingPhoto[]>;
  onAdd: (rosterId: string, file: File) => Promise<void>;
  onReview: (id: string, approve: boolean) => Promise<void>;
}) {
  const [rows, setRows] = useState<AdminMissingPhoto[] | null>(null);
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reload = () => fetchAll().then(setRows).catch(() => { setRows([]); setError("Couldn't load the photo list."); });
  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(null);
    try { await fn(); await reload(); } catch { setError("That didn't go through. Please try again."); } finally { setBusy(null); }
  }

  async function onPick(file: File | undefined) {
    const problem = pickError(file) ?? (who ? null : "Pick the classmate first.");
    if (problem) { setError(problem); return; }
    await act("add", () => onAdd(who, file!));
    setWho("");
    if (input.current) input.current.value = "";
  }

  const pending = (rows ?? []).filter((r) => r.status === "pending");
  const approved = (rows ?? []).filter((r) => r.status === "approved");
  const names = roster.filter((r) => r.status !== "pending_review");

  const Row = ({ r }: { r: AdminMissingPhoto }) => (
    <li className="flex items-center gap-3 py-2" data-testid={`admin-photo-${r.id}`}>
      <div className="h-16 w-14 shrink-0 overflow-hidden rounded border bg-muted">{r.url && <img src={r.url} alt="" className="h-full w-full object-cover" />}</div>
      <span className="flex-1 text-sm font-medium">{r.display_name}</span>
      {r.status === "pending" && (
        <Button size="sm" disabled={busy !== null} onClick={() => act(r.id, () => onReview(r.id, true))} data-testid={`button-approve-${r.id}`}>
          <Check className="mr-1 h-4 w-4" /> Approve
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(r.id, () => onReview(r.id, false))} data-testid={`button-remove-${r.id}`}>
        <Trash2 className="mr-1 h-4 w-4" /> Remove
      </Button>
    </li>
  );

  return (
    <Card className="mx-auto mt-6 max-w-xl" data-testid="card-admin-missing-photos">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" /> Missing classmate photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Waiting for your OK {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-900">{pending.length}</span>}</p>
          {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p>
            : pending.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting.</p>
            : <ul className="divide-y">{pending.map((r) => <Row key={r.id} r={r} />)}</ul>}
        </div>
        <div>
          <p className="text-sm font-semibold">Showing in the yearbook</p>
          {rows !== null && approved.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p>
            : <ul className="divide-y">{approved.map((r) => <Row key={r.id} r={r} />)}</ul>}
        </div>
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-semibold">Add a photo for a classmate</p>
          <p className="text-xs text-muted-foreground">Photos you add show in the yearbook right away and replace any earlier photo for that name.</p>
          <div className="flex flex-wrap gap-2">
            <select value={who} onChange={(e) => setWho(e.target.value)} className={cn("h-9 min-w-[200px] flex-1 rounded-md border bg-background px-2 text-sm")} data-testid="select-admin-photo-name">
              <option value="">Choose a name…</option>
              {names.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
            </select>
            <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} data-testid="input-admin-photo" />
            <Button size="sm" disabled={busy !== null || !who} onClick={() => input.current?.click()} data-testid="button-admin-photo-upload">
              <Upload className="mr-1.5 h-4 w-4" /> {busy === "add" ? "Uploading…" : "Choose photo"}
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive" data-testid="text-admin-photo-error">{error}</p>}
      </CardContent>
    </Card>
  );
}
