import { useCallback, useEffect, useRef, useState } from "react"
import { Document, Page } from "react-pdf"
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import ShiftCard from "@/components/ShiftCard"
import { getAreaCropRect } from "@/lib/pdfAreaCrop"
import { DAY_LABELS, type DayKey } from "@/config/dayLabels"
import type { AreaConfig, ShiftDTO } from "@/types/workPlanTypes"

interface Props {
  file: File
  areaConfig: AreaConfig
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDay: DayKey
  shifts: Partial<Record<DayKey, ShiftDTO>>
  onShiftChange: (key: DayKey, updated: ShiftDTO) => void
}

// Rendered once off-screen at high resolution so every crop stays sharp when zoomed.
const SOURCE_RENDER_WIDTH = 2000

export default function PdfSectionPreviewDialog({
  file,
  areaConfig,
  open,
  onOpenChange,
  initialDay,
  shifts,
  onShiftChange,
}: Props) {
  const [dayIndex, setDayIndex] = useState(() =>
    Math.max(0, DAY_LABELS.findIndex((d) => d.key === initialDay))
  )
  const [nativeSize, setNativeSize] = useState<{ w: number; h: number } | null>(null)
  const [sourceReady, setSourceReady] = useState(0)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const destCanvasRef = useRef<HTMLCanvasElement>(null)

  // Stable identity: react-pdf re-invokes ref callbacks (null, then node) whenever
  // the callback's identity changes, so an inline arrow here would re-fire every
  // render and, since it calls setState, cause an infinite update loop.
  const setSourceCanvas = useCallback((c: HTMLCanvasElement | null) => {
    sourceCanvasRef.current = c
  }, [])

  // Reset navigation to the clicked day on every closed→open transition, without
  // syncing state from an effect (https://react.dev/learn/you-might-not-need-an-effect).
  // The hidden <Page> below unmounts while closed, which nulls sourceCanvasRef via
  // setSourceCanvas — stale nativeSize/sourceReady are harmless since the draw
  // effect bails out once the source canvas is gone.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDayIndex(Math.max(0, DAY_LABELS.findIndex((d) => d.key === initialDay)))
    }
  }

  useEffect(() => {
    const source = sourceCanvasRef.current
    const dest = destCanvasRef.current
    if (!source || !dest || !nativeSize) return

    const day = DAY_LABELS[dayIndex]
    const area = areaConfig.boxes.find((b) => b.id === day.areaId)
    if (!area) return

    const rect = getAreaCropRect(area, areaConfig, nativeSize.w, nativeSize.h, source)
    dest.width = Math.max(1, Math.round(rect.sw))
    dest.height = Math.max(1, Math.round(rect.sh))
    const ctx = dest.getContext("2d")
    ctx?.drawImage(
      source,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      0,
      0,
      dest.width,
      dest.height
    )
  }, [dayIndex, nativeSize, sourceReady, areaConfig])

  const day = DAY_LABELS[dayIndex]

  function goTo(delta: number) {
    setDayIndex((i) => (i + delta + DAY_LABELS.length) % DAY_LABELS.length)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] w-[90vw] max-w-2xl flex-col gap-0 p-0"
      >
        <DialogTitle className="sr-only">PDF-Ausschnitt – {day.label}</DialogTitle>

        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">{day.label}</span>
          <DialogClose
            render={
              <Button size="icon-sm" variant="ghost" aria-label="Schließen" />
            }
          >
            <XIcon />
          </DialogClose>
        </div>

        <div className="flex flex-1 flex-col items-center gap-4 overflow-auto bg-muted/30 p-4">
          <canvas
            ref={destCanvasRef}
            className="max-h-[32vh] w-auto max-w-full rounded shadow-sm md:max-h-[60vh]"
          />
          <div className="w-full max-w-xs">
            <ShiftCard
              key={day.key}
              dayLabel={day.label}
              {...shifts[day.key]}
              onChange={(updated) => onShiftChange(day.key, updated)}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-6 border-t px-4 py-3">
          <Button
            size="icon"
            variant="outline"
            onClick={() => goTo(-1)}
            aria-label="Vorheriger Abschnitt"
          >
            <ChevronLeftIcon />
          </Button>
          <span className="w-8 text-center text-xs text-muted-foreground">
            {day.label}
          </span>
          <Button
            size="icon"
            variant="outline"
            onClick={() => goTo(1)}
            aria-label="Nächster Abschnitt"
          >
            <ChevronRightIcon />
          </Button>
        </div>

        {/* Hidden full-page render, used only as the source bitmap for crops */}
        {open && (
          <div className="hidden">
            <Document file={file}>
              <Page
                pageNumber={1}
                width={SOURCE_RENDER_WIDTH}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                canvasRef={setSourceCanvas}
                onRenderSuccess={(page) => {
                  setNativeSize({ w: page.originalWidth, h: page.originalHeight })
                  setSourceReady((n) => n + 1)
                }}
              />
            </Document>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
