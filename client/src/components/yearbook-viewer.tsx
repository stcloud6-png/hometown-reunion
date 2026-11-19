import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import HTMLFlipBook from "react-pageflip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, BookOpen, Stamp, Users } from "lucide-react";
import { MissingPhotosDialog } from "@/components/missing-photos";
import { cn } from "@/lib/utils";
import type { MissingPhoto, YearbookOverlay } from "@/lib/use-reunion-data";

/** Border colour per category (Honor Graduates + teams from the sports pages). */
/** Fixed colours (owner, 2026-11-19). */
export const BORDER_COLORS: Record<string, string> = {
  Title: "#8e24aa",                      // purple
  Honor: "#f2c200",                      // yellow
  "Biological Honor Society": "#1b5e20", // dark green
  "Computer Club": "#111111",            // black
  "Other Sports": "#0aa3a3",             // teal: Tennis, Swimming, Track
};
/** Team sports (Football, Basketball, Cheerleading, Baseball) take the team's colour. */
export const TEAM_COLORS: Record<string, string> = {
  Cougars: "#7b4a2a",  // brown
  Red: "#d32f2f",      // red ("Red Machine")
  Devils: "#22c55e",   // bright green
  Bulldogs: "#7cc4ff", // light blue
};
const TEAM_SPORTS = ["Football", "Cheerleading", "Basketball", "Baseball"];
const OTHER_SPORTS = ["Tennis", "Swimming", "Track"];
/** Button order in the chip row. */
/** Buttons switched on when the yearbook opens. */
const DEFAULT_CATS = ["Title", "Honor", "Football", "Cheerleading"];
/** The Jan 27 watermarks start switched on until 1 Feb 2027, 00:00 Eastern (owner, 2026-11-19). */
const WATERMARKS_ON_UNTIL = Date.parse("2027-02-01T00:00:00-05:00");
const BUTTONS = ["Title", "Honor", "Football", "Cheerleading", "Basketball", "Baseball", "Other Sports", "Biological Honor Society", "Computer Club"];
/** Which button a frame kind belongs to. */
const buttonFor = (kind: string) => (OTHER_SPORTS.includes(kind) ? "Other Sports" : kind);
function colorFor(kind: string, detail: string | null): string {
  if (TEAM_SPORTS.includes(kind)) return (detail && TEAM_COLORS[detail]) || "#666";
  return BORDER_COLORS[buttonFor(kind)] ?? "#666";
}
/** Dark text on light colours (yellow, light blue, bright green), white text otherwise. */
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111" : "#fff";
}
const CLUBS = ["Computer Club", "Biological Honor Society"];
const CATEGORY_LABEL: Record<string, string> = { Honor: "Honor Graduates", Title: "Class Title Winners" };
/** Short chip text for the compact button row. */
const SHORT_LABEL: Record<string, string> = { Title: "Titles", Honor: "Honor Grads", Cheerleading: "Cheer", "Biological Honor Society": "Bio Honor Soc.", "Computer Club": "Computer", "Other Sports": "Other Sports" };
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
  if (kind === "Honor") return "HONOR GRAD";
  if (kind === "Title") return detail ?? "Class Title";
  if (kind === "Biological Honor Society") return "Bio Honor Society";
  // Football and cheerleading stand out in capitals (owner, 2026-11-19).
  if (kind === "Football" || kind === "Cheerleading") {
    const k = kind === "Cheerleading" ? "CHEER" : "FOOTBALL"; // short word = bigger letters
    return detail ? `${k} · ${detail.toUpperCase()}` : k;
  }
  return detail ? `${kind} · ${detail}` : kind;
}

/** When several frames are on, the label that shows is: class titles first, then teams, then Honor. */
/** Outside-in order of the nested frames. */
const RING_ORDER = (kind: string) =>
  ({ Honor: 0, Title: 1, Football: 2, Cheerleading: 2, "Computer Club": 3, "Biological Honor Society": 4 } as Record<string, number>)[kind] ?? 5;

/** Show/hide rules for every frame kind, generated so a new category only needs a colour above. */
const FRAME_CSS = BUTTONS
  .map((k) => `.yearbook-stage.show-${slug(k)} .yb-ring-${slug(k)}{display:block}`)
  .join("\n");

const TOTAL_PAGES = 173;

interface YearbookViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Public overlay data (watermarks + borders). Optional so the viewer still works without it. */
  fetchOverlays?: () => Promise<YearbookOverlay[]>;
  /** Approved photos of classmates with no senior portrait (pop-up). */
  fetchMissingPhotos?: () => Promise<MissingPhoto[]>;
}

/** The last senior portrait in the book (Lori Nickisher, viewer page 33): the Missing Photos link sits just after it. */
const MISSING_LINK_PAGE = 33;
const MISSING_LINK_BOX = { left: 74.8, top: 12.46 + 18.53 + 4.6, width: 17.14 };

/** A single flip-able page — react-pageflip clones this as a forwardRef so the
 * page element itself is what gets the flip transform applied. */
const Page = forwardRef<HTMLDivElement, { pageNumber: number; overlays?: YearbookOverlay[]; onMissingPhotos?: () => void }>(({ pageNumber, overlays, onMissingPhotos }, ref) => {
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
          // Frames nest from the outside in (owner, 2026-11-19): yellow Honor outermost, then purple title,
          // football/cheer team colour, Computer Club, Bio Honor Society, then the other sports.
          const frames = [...(o.honor ? ["Honor"] : []), ...o.categories]
            .map((raw) => parseCat(raw))
            .sort((x, y) => RING_ORDER(x.kind) - RING_ORDER(y.kind));
          const labelStyle = (f: { kind: string; detail: string | null }) => ({
            backgroundColor: colorFor(f.kind, f.detail),
            color: textOn(colorFor(f.kind, f.detail)),
            fontSize: `max(5px, min(6.2cqw, ${(112 / Math.max(1, frameLabel(f.kind, f.detail).length)).toFixed(2)}cqw))`,
          });
          const label = (f: { kind: string; detail: string | null }, key: string) => (
            <span key={key} className={`yb-ring yb-ring-${slug(buttonFor(f.kind))} yb-label`}
              style={f.kind === "Cheerleading" ? { ...labelStyle(f), fontWeight: 800, letterSpacing: "0.02em" } : labelStyle(f)} data-testid="yearbook-frame-label">
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
                <div key={`r-${k}`} className={`yb-ring yb-ring-${slug(buttonFor(f.kind))} absolute rounded-[1px] border-[3px]`}
                  style={{ inset: `${3 * k}px`, borderColor: colorFor(f.kind, f.detail) }} />
              ))}
              <div className="absolute inset-x-[5%] top-0 flex -translate-y-[35%] flex-col items-stretch gap-[1.5cqw]">
                {[...title, ...clubs].map((f, k) => label(f, `t-${k}`))}
              </div>
              {honor.length > 0 && (
                <span className="yb-ring yb-ring-honor yb-label yb-label-side absolute right-0 top-1/2 translate-x-[30%] -translate-y-1/2"
                  style={{ ...labelStyle(honor[0]), fontSize: "max(5.5px, 5.6cqw)", fontWeight: 800 }} data-testid="yearbook-honor-label">
                  HONOR GRAD
                </span>
              )}
              {/* Bottom stack sits inside the photo so it never covers the classmate's printed name. */}
              <div className="absolute inset-x-[5%] bottom-[3%] flex flex-col-reverse items-stretch gap-[1.5cqw]">
                {/* Two rows are always kept free under the watermark for team labels. */}
                <div className="flex min-h-[17cqw] flex-col-reverse items-stretch gap-[1.5cqw]">
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
        {pageNumber === MISSING_LINK_PAGE && onMissingPhotos && (
          <button
            type="button"
            className="absolute z-10 flex items-center justify-center whitespace-nowrap rounded-sm border border-[#8a6d3b] bg-[#fff8e6]/95 px-[1.2%] py-[0.5%] font-serif text-[clamp(8px,1.6vh,13px)] font-semibold text-[#5b4320] shadow hover:bg-white"
            style={{ left: `${MISSING_LINK_BOX.left}%`, top: `${MISSING_LINK_BOX.top}%` }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onMissingPhotos(); }}
            data-testid="link-missing-photos-page"
          >
            Missing photos &rarr;
          </button>
        )}
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
export default function YearbookViewer({ open, onOpenChange, fetchOverlays, fetchMissingPhotos }: YearbookViewerProps) {
  const [missingOpen, setMissingOpen] = useState(false);
  const flipBookRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [jumpValue, setJumpValue] = useState("");
  const [overlays, setOverlays] = useState<YearbookOverlay[] | null>(fetchOverlays ? null : []);
  const [showWatermarks, setShowWatermarks] = useState(() => Date.now() < WATERMARKS_ON_UNTIL);
  // Honor Graduates frames are on when the yearbook opens; every team is its own button, off until clicked.
  // On by default (owner, 2026-11-19): Titles, Honor Grads, Football, Cheer.
  const [activeCats, setActiveCats] = useState<string[]>(DEFAULT_CATS);
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
    for (const o of overlays ?? []) { if (o.honor) seen.add("Honor"); o.categories.forEach((c) => seen.add(buttonFor(parseCat(c).kind))); }
    return BUTTONS.filter((k) => seen.has(k));
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
        className="flex h-[96vh] max-h-[96vh] w-[98vw] max-w-5xl flex-col gap-1.5 overflow-hidden p-2.5 sm:p-3"
      >
        {/* One slim bar: title + page controls, so the yearbook gets the height. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-8">
          <DialogTitle className="mr-auto flex items-center gap-1.5 text-sm font-semibold">
            <BookOpen className="h-4 w-4" /> Panama &rsquo;87 Yearbook
          </DialogTitle>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={goPrev} aria-label="Previous page" data-testid="button-yearbook-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground" data-testid="text-yearbook-page-count">
            {currentPage + 1} / {TOTAL_PAGES}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={goNext} aria-label="Next page" data-testid="button-yearbook-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Input
            type="number"
            min={1}
            max={TOTAL_PAGES}
            placeholder="Page"
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && jumpToPage()}
            className="h-7 w-16 px-2 text-xs"
            data-testid="input-yearbook-jump"
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={jumpToPage} data-testid="button-yearbook-jump">Go</Button>
        </div>

        <div
          className={cn("yearbook-stage flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-muted/40 py-1", showWatermarks && "show-wm", activeCats.map((c) => `show-${slug(c)}`))}
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
              <Page key={p} pageNumber={p} overlays={byPage.get(p)} onMissingPhotos={fetchMissingPhotos ? () => setMissingOpen(true) : undefined} />
            ))}
          </HTMLFlipBook>
          )}
        </div>

        {(overlays?.length ?? 0) > 0 && (
          // One compact row of small chips, so the flipbook keeps its full size.
          <div className="flex flex-wrap items-center gap-1" data-testid="yearbook-overlay-buttons">
            <button type="button" aria-pressed={showWatermarks} onClick={() => setShowWatermarks((v) => !v)}
              className={cn("yb-chip", showWatermarks && "yb-chip-on")} style={showWatermarks ? { backgroundColor: "#ffd400", borderColor: "#c9a800", color: "#222" } : undefined}
              data-testid="button-yearbook-watermarks">
              <Stamp className="h-3 w-3" /> Jan 27
            </button>
            <button type="button" disabled title="July 2027 — coming later"
              className="yb-chip cursor-not-allowed opacity-50" data-testid="button-yearbook-jul-2027">
              <Stamp className="h-3 w-3" /> Jul 2027
            </button>
            {fetchMissingPhotos && (
              <button type="button" onClick={() => setMissingOpen(true)} className="yb-chip" title="Classmates with no senior portrait"
                data-testid="button-yearbook-missing-photos">
                <Users className="h-3 w-3" /> Missing photos
              </button>
            )}
            <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            {legend.map((c) => {
              const on = activeCats.includes(c);
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => toggleCat(c)}
                  className={cn("yb-chip", on && "yb-chip-on")}
                  style={on ? { borderColor: BORDER_COLORS[c] ?? "#555", backgroundColor: `${BORDER_COLORS[c] ?? "#777777"}22` } : undefined}
                  data-testid={`button-yearbook-cat-${slug(c)}`}>
                  {TEAM_SPORTS.includes(c) ? (
                    <span className="inline-flex shrink-0 overflow-hidden rounded-[2px]" aria-hidden="true">
                      {Object.values(TEAM_COLORS).map((tc) => <span key={tc} className="h-2 w-[3px]" style={{ backgroundColor: tc }} />)}
                    </span>
                  ) : (
                    <span className="inline-block h-2 w-2 shrink-0 rounded-[2px] border-[1.5px]" style={{ borderColor: BORDER_COLORS[c], backgroundColor: on ? BORDER_COLORS[c] : "transparent" }} />
                  )}
                  {SHORT_LABEL[c] ?? CATEGORY_LABEL[c] ?? c}
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
      <MissingPhotosDialog open={missingOpen} onOpenChange={setMissingOpen} fetchPhotos={fetchMissingPhotos} showWatermarks={showWatermarks} />
    </Dialog>
  );
}
