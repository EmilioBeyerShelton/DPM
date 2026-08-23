import { useEffect, useRef, useState } from "react"
import { Document, Page } from "react-pdf"
import { XIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface Props {
  file: File
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

function touchDist(t: TouchList) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
}

export default function PdfViewerDialog({ file, open, onOpenChange }: Props) {
  const [numPages, setNumPages] = useState(0)
  const [zoom, setZoom] = useState(1)

  // Always-current ref so pinch handler avoids stale closure
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const scrollRef = useRef<HTMLDivElement>(null)

  // Attach non-passive touchmove so we can e.preventDefault() during pinch
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let initDist: number | null = null
    let initZoom = 1

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initDist = touchDist(e.touches)
        initZoom = zoomRef.current
      }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initDist === null) return
      e.preventDefault()
      const scale = touchDist(e.touches) / initDist
      setZoom(+(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, initZoom * scale)).toFixed(2)))
    }
    const onEnd = () => { initDist = null }

    el.addEventListener("touchstart", onStart)
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd)
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
    }
  }, [open]) // re-attach after DOM rebuild on open/close

  const baseWidth = Math.min(860, window.innerWidth * 0.9 - 64)
  const pageWidth = Math.round(baseWidth * zoom)
  const isMobile = window.innerWidth < 768

  // ── Shared pieces ──────────────────────────────────────────────────────────

  const zoomBar = (
    <div className="flex items-center gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
        disabled={zoom <= MIN_ZOOM}
        aria-label="Verkleinern"
      >
        <ZoomOutIcon />
      </Button>
      <button
        className="w-14 rounded px-1 py-0.5 text-center text-xs tabular-nums hover:bg-muted"
        onClick={() => setZoom(1)}
        aria-label="Zoom zurücksetzen"
      >
        {Math.round(zoom * 100)} %
      </button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Vergrößern"
      >
        <ZoomInIcon />
      </Button>
    </div>
  )

  const pdfArea = (
    <div
      ref={scrollRef}
      className="flex flex-1 flex-col items-center gap-4 overflow-auto p-4"
    >
      <Document
        file={file}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i + 1}
            pageNumber={i + 1}
            width={pageWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-md"
          />
        ))}
      </Document>
    </div>
  )

  // ── Mobile: full-screen overlay, no dialog ─────────────────────────────────

  if (isMobile) {
    if (!open) return null
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <span className="max-w-[50%] truncate text-sm font-medium">
            {file.name}
          </span>
          <div className="flex items-center gap-1">
            {zoomBar}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="Schließen"
            >
              <XIcon />
            </Button>
          </div>
        </div>
        {pdfArea}
      </div>
    )
  }

  // ── Desktop: shadcn dialog ─────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-0 p-0 sm:max-w-[90vw]"
      >
        <DialogTitle className="sr-only">{file.name}</DialogTitle>

        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <span className="max-w-[50%] truncate text-sm font-medium">
            {file.name}
          </span>
          <div className="flex items-center gap-1">
            {zoomBar}
            <DialogClose
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Schließen"
                />
              }
            >
              <XIcon />
            </DialogClose>
          </div>
        </div>

        {pdfArea}
      </DialogContent>
    </Dialog>
  )
}
