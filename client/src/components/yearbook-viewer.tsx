import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import HTMLFlipBook from "react-pageflip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, BookOpen, Award, Stamp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { YearbookOverlay } from "@/lib/use-reunion-data";

/** Border colour per category (Honor Graduates + teams from the sports pages). */
export const BORDER_COLORS: Record<string, string> = {
  Honor: "#d4a017",
  Basketball: "#e4572e",
  Baseball: "#2e6fd8",
  Tennis: "#2e9e57",
  Swimming: "#0aa3a3",
  "Sports Shorts": "#8e44ad",
};

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
          const cats = [...(o.honor ? ["Honor"] : []), ...o.categories].slice(0, 3);
          const ring = cats.map((c, k) => `0 0 0 ${(k + 1) * 3}px ${BORDER_COLORS[c] ?? "#888"}`).join(", ");
          return (
            <div key={i} className="pointer-events-none absolute" style={{ left: `${o.box[0]}%`, top: `${o.box[1]}%`, width: `${o.box[2]}%`, height: `${o.box[3]}%` }}>
              {ring && <div className="yb-border absolute inset-0 rounded-[2px]" style={{ boxShadow: ring }} />}
              {o.watermark && (
                <div className="yb-wm absolute inset-0 items-center justify-center overflow-hidden">
                  <span className="flex -rotate-[28deg] flex-col items-center font-serif font-bold leading-none tracking-wide text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.85)]">
                    <span className="text-[clamp(14px,3vw,28px)]">2026</span>
                    {o.watermark !== "2026" && <span className="mt-0.5 text-[clamp(6px,0.95vw,10px)] uppercase tracking-normal">{o.watermark.replace(/^2026\s*-\s*/, "")}</span>}
                  </span>
                </div>
              )}
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
  const [showBorders, setShowBorders] = useState(false);

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
    for (const o of overlays ?? []) { if (o.honor) seen.add("Honor"); o.categories.forEach((c) => seen.add(c)); }
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
          className={cn("yearbook-stage flex flex-1 items-center justify-center overflow-hidden rounded-md bg-muted/40 py-2", showWatermarks && "show-wm", showBorders && "show-borders")}
          data-testid="yearbook-stage"
        >
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
            {(overlays?.length ?? 0) > 0 && (
              <>
                <Button variant={showWatermarks ? "default" : "outline"} size="sm" aria-pressed={showWatermarks}
                  onClick={() => setShowWatermarks((v) => !v)} data-testid="button-yearbook-watermarks">
                  <Stamp className="mr-1 h-4 w-4" /> 2026
                </Button>
                <Button variant={showBorders ? "default" : "outline"} size="sm" aria-pressed={showBorders}
                  onClick={() => setShowBorders((v) => !v)} data-testid="button-yearbook-borders">
                  <Award className="mr-1 h-4 w-4" /> Honors &amp; teams
                </Button>
              </>
            )}
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
        {showBorders && legend.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" data-testid="yearbook-border-legend">
            {legend.map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border-2" style={{ borderColor: BORDER_COLORS[k] }} />
                {k === "Honor" ? "Honor Graduate" : k}
              </span>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
