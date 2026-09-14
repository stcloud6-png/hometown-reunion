import { useMemo, useRef, useState, forwardRef } from "react";
import HTMLFlipBook from "react-pageflip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";

const TOTAL_PAGES = 173;

interface YearbookViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A single flip-able page — react-pageflip clones this as a forwardRef so the
 * page element itself is what gets the flip transform applied. */
const Page = forwardRef<HTMLDivElement, { pageNumber: number }>(({ pageNumber }, ref) => {
  return (
    <div className="yearbook-page bg-[#f4ecd8]" ref={ref}>
      <img
        src={`${import.meta.env.BASE_URL}yearbook/page-${String(pageNumber).padStart(3, "0")}.jpg`}
        alt={`Yearbook page ${pageNumber}`}
        loading="lazy"
        className="h-full w-full select-none object-contain"
        draggable={false}
      />
    </div>
  );
});
Page.displayName = "Page";

/**
 * Full "Panama Eighty-Seven" Balboa yearbook, rendered as a real page-turning
 * flipbook (react-pageflip) over the 163 pre-rendered page images in
 * /public/yearbook/. Opened from the Yearbook logo in the sticky header.
 */
export default function YearbookViewer({ open, onOpenChange }: YearbookViewerProps) {
  const flipBookRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [jumpValue, setJumpValue] = useState("");

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

        <div className="flex flex-1 items-center justify-center overflow-hidden rounded-md bg-muted/40 py-2">
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
              <Page key={p} pageNumber={p} />
            ))}
          </HTMLFlipBook>
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
      </DialogContent>
    </Dialog>
  );
}
