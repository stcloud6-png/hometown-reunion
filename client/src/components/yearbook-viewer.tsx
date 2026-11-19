import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import HTMLFlipBook from "react-pageflip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, BookOpen, Stamp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { YearbookOverlay } from "@/lib/use-reunion-data";

/** Border colour per category (Honor Graduates + teams from the sports pages). */
export const BORDER_COLORS: Record<string, string> = {
  Title: "#8e24aa",
  Honor: "#d4a017",
  Football: "#8b5a2b",
  Cheerleading: "#e84393",
  Basketball: "#e4572e",
  Baseball: "#2e6fd8",
  Tennis: "#2e9e57",
  Swimming: "#0aa3a3",
  Track: "#3949ab",
  "Computer Club": "#263238",
  "Biological Honor Society": "#9e9d24",
};
const CLUBS = ["Computer Club", "Biological Honor Society"];
const CATEGORY_LABEL: Record<string, string> = { Honor: "Honor Graduates", Title: "Class Title Winners" };
/** Short chip text for the compact button row. */
const SHORT_LABEL: Record<string, string> = { Title: "Titles", Honor: "Honor Grads", Cheerleading: "Cheer", "Biological Honor Society": "Bio Honor Soc.", "Computer Club": "Computer" };
const slug = (c: string) => c.toLowerCase().replace(/[^a-z]+/g, "-");

/**
 * A category string from the database is "Sport" or "Sport:Team" (e.g. "Football:Cougars"),
 * or "Title:Most Likely To Succeed". The button groups by the part before the colon.
 */
function parseCat(raw: string): { kind: string; detail: string | null } {
  const i = raw.indexOf(":");
  return i < 0 ? { kind: raw, detail: null } : { kind: raw.slice(0, i), detail: raw.slice(i + 1) };
}

/** Label written on the frame line. */
function frameLabel(kind: string, detail: string | null): string {
  if (kind === "Honor") return "Honor Grad";
  if (kind === "Title") return detail ?? "Class Title";
  if (kind === "Biological Honor Society") return "Bio Honor Society";
  return detail ? `${kind} · ${detail}` : kind;
}

/** When several frames are on, the label that shows is: class titles first, then teams, then Honor. */
// Clubs rank after teams and before Honor.
const PRIORITY = (kind: string) => (kind === "Title" ? 0 : kind === "Honor" ? 3 : CLUBS.includes(kind) ? 2 : 1);

/** Show/hide rules for every frame kind, generated so a new category only needs a colour above. */
const FRAME_CSS = Object.keys(BORDER_COLORS)
  .map((k) => `.yearbook-stage.show-${slug(k)} .yb-ring-${slug(k)}{display:block}`)
  .join("\n");

const TOTAL_PAGES = 173;

interface YearbookViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Public overlay data (watermarks + borders). Optional so the viewer still works without it. */
  fetchOverlays?: () => Promise<YearbookOverlay[]>;
}

/** A single flip-able page — react-pageflip clones this as a forwardRef so the
 * page element itself is what gets the flip transform applied. */
const Page = forwardRef<HTMLDivElement, { pageNumber: number; overlays?: YearbookOverlay[] }>(({ pageNumber, overlays }, ref) => {
  return (
    <div className="yearbook-page flex items-center justify-center bg-[#f4ecd8]" ref={ref}>
      {/* Same aspect as the scans, so overlay boxes (in % of the page) line up. */}
      <div className="relative aspect-[980/1268] h-full max-w-full">
        <img
          src={`${import.meta.env.BASE_URL}yearbook/page-${String(pageNumber).padStart(3, "0")}.jpg`}
          alt={`Yearbook page ${pageNumber}`}
          loading="lazy"
          className="h-full w-full select-none object-contain"
          draggable={false}
        />
        {overlays?.map((o, i) => {
          // Outermost frame = highest priority (titles, then teams, then Honor).
          const frames = [...(o.honor ? ["Honor"] : []), ...o.categories]
            .map((raw) => parseCat(raw))
            .sort((x, y) => PRIORITY(x.kind) - PRIORITY(y.kind));
          const labelStyle = (f: { kind: string; detail: string | null }) => ({
            backgroundColor: BORDER_COLORS[f.kind] ?? "#888",
            fontSize: `max(5px, min(6.2cqw, ${(112 / Math.max(1, frameLabel(f.kind, f.detail).length)).toFixed(2)}cqw))`,
          });
          const label = (f: { kind: string; detail: string | null }, key: string) => (
            <span key={key} className={`yb-ring yb-ring-${slug(f.kind)} yb-label`} style={labelStyle(f)} data-testid="yearbook-frame-label">
              {frameLabel(f.kind, f.detail)}
            </span>
          );
          // Where each label goes (owner layout, 2026-11-19):
          //  top edge, top→down: class title, Biological Honor Society, Computer Club;
          //  right edge: Honor Graduate; bottom edge, bottom→up: football/cheerleading, then any other sport,
          //  then the Jan 2027 watermark one row above them. Every switched-on label stays visible.
          const title = frames.filter((f) => f.kind === "Title");
          const clubs = ["Biological Honor Society", "Computer Club"].flatMap((k) => frames.filter((f) => f.kind === k));
          const honor = frames.filter((f) => f.kind === "Honor");
          const fbCheer = frames.filter((f) => f.kind === "Football" || f.kind === "Cheerleading");
          const otherSports = frames.filter((f) => !["Title", "Honor", "Football", "Cheerleading", ...CLUBS].includes(f.kind));
          return (
            <div key={i} className="pointer-events-none absolute" style={{ left: `${o.box[0]}%`, top: `${o.box[1]}%`, width: `${o.box[2]}%`, height: `${o.box[3]}%`, containerType: "inline-size" }}>
              {/* One frame per category, inside the photo edge; each shows only while its own button is on. */}
              {frames.map((f, k) => (
                <div key={`r-${k}`} className={`yb-ring yb-ring-${slug(f.kind)} absolute rounded-[1px] border-[3px]`}
                  style={{ inset: `${3 * k}px`, borderColor: BORDER_COLORS[f.kind] ?? "#888" }} />
              ))}
              <div className="absolute inset-x-[5%] top-0 flex -translate-y-[35%] flex-col items-stretch gap-[1.5cqw]">
                {[...title, ...clubs].map((f, k) => label(f, `t-${k}`))}
              </div>
              {honor.length > 0 && (
                <span className="yb-ring yb-ring-honor yb-label yb-label-side absolute right-0 top-1/2 translate-x-[35%] -translate-y-1/2" style={labelStyle(honor[0])} data-testid="yearbook-honor-label">
                  Honor Grad
                </span>
              )}
              <div className="absolute inset-x-[5%] bottom-0 flex translate-y-[35%] flex-col-reverse items-stretch gap-[1.5cqw]">
                {/* At least one row is always kept free under the watermark for these labels. */}
                <div className="flex min-h-[7.5cqw] flex-col-reverse items-stretch gap-[1.5cqw]">
                  {[...fbCheer, ...otherSports].map((f, k) => label(f, `b-${k}`))}
                </div>
                {o.watermark && (
                  <div className="yb-wm items-center justify-center" data-testid="yearbook-watermark-band">
                    <span
                      className="whitespace-nowrap font-sans font-bold leading-none text-[#ffd400] [text-shadow:0_0_2px_rgba(0,0,0,.9),0_1px_2px_rgba(0,0,0,.9)]"
                      style={{ fontSize: o.watermark === "2026" ? "9.5cqw" : "8.5cqw" }}
                      data-testid="yearbook-watermark"
                    >
                      {/* Neutral wording on purpose: nothing here says anything about payment. */}
                      {o.watermark === "2026" ? "Jan 2027" : "2027 \u2013 Soon"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
Page.displayName = "Page";

/**
 * Full "Panama Eighty-Seven" Balboa yearbook, rendered as a real page-turning
 * flipbook (react-pageflip) over the 163 pre-rendered page images in
 * /public/yearbook/. Opened from the Yearbook logo in the sticky header.
 */
export default function YearbookViewer({ open, onOpenChange, fetchOverlays }: YearbookViewerProps) {
  const flipBookRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [jumpValue, setJumpValue] = useState("");
  const [overlays, setOverlays] = useState<YearbookOverlay[] | null>(fetchOverlays ? null : []);
  const [showWatermarks, setShowWatermarks] = useState(false);
  // Honor Graduates frames are on when the yearbook opens; every team is its own button, off until clicked.
  const [activeCats, setActiveCats] = useState<string[]>(["Honor"]);
  const toggleCat = (c: string) => setActiveCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  // Load overlay data once, the first time the yearbook opens. The flipbook waits for it
  // (or for a failure) so pages render with their overlays from the start.
  useEffect(() => {
    if (!open || overlays !== null || !fetchOverlays) return;
    let cancelled = false;
    fetchOverlays().then((rows) => { if (!cancelled) setOverlays(rows ?? []); }).catch(() => { if (!cancelled) setOverlays([]); });
    return () => { cancelled = true; };
  }, [open, overlays, fetchOverlays]);

  const byPage = useMemo(() => {
    const m = new Map<number, YearbookOverlay[]>();
    for (const o of overlays ?? []) m.set(o.page, [...(m.get(o.page) ?? []), o]);
    return m;
  }, [overlays]);
  const legend = useMemo(() => {
    const seen = new Set<string>();
    for (const o of overlays ?? []) { if (o.honor) seen.add("Honor"); o.categories.forEach((c) => seen.add(parseCat(c).kind)); }
    return Object.keys(BORDER_COLORS).filter((k) => seen.has(k));
  }, [overlays]);

  const pages = useMemo(() => Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1), []);

  function goPrev() {
    flipBookRef.current?.pageFlip()?.flipPrev();
  }
  function goNext() {
    flipBookRef.current?.pageFlip()?.flipNext();
  }
  function jumpToPage() {
    const n = parseInt(jumpValue, 10);
    if (Number.isFinite(n) && n >= 1 && n <= TOTAL_PAGES) {
      // turnToPage() jumps straight to the target page (no animation) — flip()
      // only performs a single adjacent-page turn, so it can't be used for
      // long-distance jumps like this.
      flipBookRef.current?.pageFlip()?.turnToPage(n - 1);
      setCurrentPage(n - 1);
    }
    setJumpValue("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="dialog-yearbook-viewer"
        className="flex max-h-[92vh] w-[96vw] max-w-4xl flex-col gap-3 overflow-hidden p-4 sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Balboa &quot;Panama&quot; Yearbook &mdash; Eighty-Seven
          </DialogTitle>
        </DialogHeader>

        <div
          className={cn("yearbook-stage flex flex-1 items-center justify-center overflow-hidden rounded-md bg-muted/40 py-2", showWatermarks && "show-wm", activeCats.map((c) => `show-${slug(c)}`))}
          data-testid="yearbook-stage"
        >
          <style>{FRAME_CSS}</style>
          {overlays === null ? (
            <p className="py-24 text-sm text-muted-foreground">Opening the yearbook…</p>
          ) : (
          <HTMLFlipBook
            key="yearbook-flipbook"
            ref={flipBookRef}
            width={380}
            height={491}
            size="stretch"
            minWidth={240}
            maxWidth={560}
            minHeight={310}
            maxHeight={724}
            showCover={true}
            usePortrait={true}
            drawShadow={true}
            flippingTime={600}
            maxShadowOpacity={0.5}
            mobileScrollSupport={true}
            clickEventForward={true}
            useMouseEvents={true}
            swipeDistance={20}
            showPageCorners={true}
            disableFlipByClick={false}
            startPage={0}
            startZIndex={0}
            autoSize={true}
            className="yearbook-flipbook"
            style={{}}
            onFlip={(e: any) => setCurrentPage(e.data)}
          >
            {pages.map((p) => (
              <Page key={p} pageNumber={p} overlays={byPage.get(p)} />
            ))}
          </HTMLFlipBook>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrev} data-testid="button-yearbook-prev">
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button variant="outline" size="sm" onClick={goNext} data-testid="button-yearbook-next">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground" data-testid="text-yearbook-page-count">
              Page {currentPage + 1} of {TOTAL_PAGES}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={TOTAL_PAGES}
              placeholder="Page #"
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && jumpToPage()}
              className="h-9 w-24 sm:w-32"
              data-testid="input-yearbook-jump"
            />
            <Button size="sm" onClick={jumpToPage} data-testid="button-yearbook-jump">
              Go
            </Button>
          </div>
        </div>
        {(overlays?.length ?? 0) > 0 && (
          // One compact row of small chips, so the flipbook keeps its full size.
          <div className="-mt-1 flex flex-wrap items-center gap-1" data-testid="yearbook-overlay-buttons">
            <button type="button" aria-pressed={showWatermarks} onClick={() => setShowWatermarks((v) => !v)}
              className={cn("yb-chip", showWatermarks && "yb-chip-on")} style={showWatermarks ? { backgroundColor: "#ffd400", borderColor: "#c9a800", color: "#222" } : undefined}
              data-testid="button-yearbook-watermarks">
              <Stamp className="h-3 w-3" /> Jan 27
            </button>
            <button type="button" disabled title="July 2027 — coming later"
              className="yb-chip cursor-not-allowed opacity-50" data-testid="button-yearbook-jul-2027">
              <Stamp className="h-3 w-3" /> Jul 2027
            </button>
            <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            {legend.map((c) => {
              const on = activeCats.includes(c);
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => toggleCat(c)}
                  className={cn("yb-chip", on && "yb-chip-on")}
                  style={on ? { borderColor: BORDER_COLORS[c], backgroundColor: `${BORDER_COLORS[c]}26` } : undefined}
                  data-testid={`button-yearbook-cat-${slug(c)}`}>
                  <span className="inline-block h-2 w-2 shrink-0 rounded-[2px] border-[1.5px]" style={{ borderColor: BORDER_COLORS[c], backgroundColor: on ? BORDER_COLORS[c] : "transparent" }} />
                  {SHORT_LABEL[c] ?? CATEGORY_LABEL[c] ?? c}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
