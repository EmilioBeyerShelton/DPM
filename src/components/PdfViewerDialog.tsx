import { useState } from "react"
import { Document, Page } from "react-pdf"
import { ZoomInIcon, ZoomOutIcon } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

interface Props {
  file: File
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

export default function PdfViewerDialog({ file, open, onOpenChange }: Props) {
  const [numPages, setNumPages] = useState(0)
  const [zoom, setZoom] = useState(1)

  // Base page width fills ~90 vw minus dialog padding; capped at 860 px
  const baseWidth = Math.min(860, window.innerWidth * 0.9 - 64)
  const pageWidth = Math.round(baseWidth * zoom)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-0 p-0 sm:max-w-[90vw]"
      >
        {/* ── Toolbar ──────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <DialogTitle className="max-w-[50%] truncate text-sm font-medium">
            {file.name}
          </DialogTitle>

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

            <DialogClose
              render={
                <Button size="icon-sm" variant="ghost" aria-label="Schließen" />
              }
            >
              <XIcon />
            </DialogClose>
          </div>
        </div>

        {/* ── Scrollable PDF area ───────────────────────────────────── */}
        <div className="flex flex-1 flex-col items-center gap-4 overflow-auto p-4">
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
      </DialogContent>
    </Dialog>
  )
}
