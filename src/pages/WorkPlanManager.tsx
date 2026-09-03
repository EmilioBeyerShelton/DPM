import { useRef, useState } from "react"
import { pdfjs } from "react-pdf"
import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { Settings2Icon, UploadIcon } from "lucide-react"
import PdfThumbnail from "@/components/PdfThumbnail"
import PdfViewerDialog from "@/components/PdfViewerDialog"
import PdfSectionPreviewDialog from "@/components/PdfSectionPreviewDialog"
import defaultAreas from "@/config/defaultAreas"
import { DAY_LABELS, type DayKey } from "@/config/dayLabels"
import { mapTextNodesToWorkPlan } from "@/lib/workPlanMapper"
import { dayEntryToShiftDTO } from "@/lib/shiftMapper"
import type { AreaConfig, ShiftDTO, WorkPlanEntry } from "@/types/workPlanTypes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import ShiftCard from "@/components/ShiftCard"
import { generateIcs, downloadIcs, icsFilename } from "@/lib/icsExport"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

interface TextNode {
  page: number
  str: string
  x: number
  y: number
  width: number
  height: number
}

function entryToShifts(
  entry: WorkPlanEntry
): Partial<Record<DayKey, ShiftDTO>> {
  const result: Partial<Record<DayKey, ShiftDTO>> = {}
  for (const { key } of DAY_LABELS) {
    const dayEntry = entry.schedule[key]
    if (dayEntry) result[key] = dayEntryToShiftDTO(dayEntry)
  }
  return result
}

export default function WorkPlanManager() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [textNodes, setTextNodes] = useState<TextNode[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [areaConfig, setAreaConfig] = useState<AreaConfig>(defaultAreas)
  const [mappedEntry, setMappedEntry] = useState<WorkPlanEntry | null>(null)
  const [shifts, setShifts] = useState<Partial<Record<DayKey, ShiftDTO>>>({})
  const [pageHeight, setPageHeight] = useState(0)
  const [loadCount, setLoadCount] = useState(0)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const [previewDay, setPreviewDay] = useState<DayKey | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [eventTitle, setEventTitle] = useState("Arbeiten Flora")
  const [notesPrefix, setNotesPrefix] = useState("shows: ")

  const pdfInputRef = useRef<HTMLInputElement>(null)
  const areasInputRef = useRef<HTMLInputElement>(null)

  function applyEntry(entry: WorkPlanEntry) {
    setMappedEntry(entry)
    setShifts(entryToShifts(entry))
    setLoadCount((c) => c + 1)
  }

  function updateShift(key: DayKey, updated: ShiftDTO) {
    setShifts((prev) => ({ ...prev, [key]: updated }))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || file.type !== "application/pdf") return

    setPdfFile(file)
    setTextNodes([])
    setMappedEntry(null)
    setShifts({})
    setIsExtracting(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
      const nodes: TextNode[] = []
      let ph = 0

      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum)
        if (pageNum === 1) {
          ph = page.getViewport({ scale: 1 }).height
          setPageHeight(ph)
        }
        const content = await page.getTextContent()
        for (const item of content.items) {
          const textItem = item as TextItem
          if (!("str" in textItem) || !textItem.str.trim()) continue
          nodes.push({
            page: pageNum,
            str: textItem.str,
            x: Math.round(textItem.transform[4]),
            y: Math.round(textItem.transform[5]),
            width: Math.round(textItem.width),
            height: Math.round(textItem.height),
          })
        }
      }

      const sorted = nodes.sort((a, b) => b.y - a.y)
      setTextNodes(sorted)
      applyEntry(mapTextNodesToWorkPlan(sorted, areaConfig, ph))
    } finally {
      setIsExtracting(false)
      e.target.value = ""
    }
  }

  function handleAreasUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        const config: AreaConfig = Array.isArray(parsed)
          ? { boxes: parsed }
          : parsed
        setAreaConfig(config)
        if (textNodes.length > 0 && pageHeight > 0) {
          applyEntry(mapTextNodesToWorkPlan(textNodes, config, pageHeight))
        }
      } catch {
        alert("Invalid JSON file.")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  return (
    <div className="relative flex min-h-svh flex-col justify-center gap-8 p-6">
      {/* ── Settings gear ────────────────────────────────────────────── */}
      <Button
        size="icon-sm"
        variant="ghost"
        className="absolute top-4 right-4 z-10"
        onClick={() => setSettingsOpen(true)}
        aria-label="Einstellungen"
      >
        <Settings2Icon />
      </Button>

      {/* ── Settings dialog ──────────────────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Einstellungen</DialogTitle>
            <DialogDescription>
              Konfiguration für den Bereichs-Mapper
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Bereichs-Konfiguration (JSON)</FieldLabel>
              <FieldDescription>
                {areaConfig === defaultAreas
                  ? "Standard-Konfiguration aktiv"
                  : "Benutzerdefinierte Konfiguration geladen"}
              </FieldDescription>
              <input
                ref={areasInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleAreasUpload}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => areasInputRef.current?.click()}
              >
                <UploadIcon />
                JSON hochladen
              </Button>
            </Field>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── PDF upload / preview ─────────────────────────────────────── */}
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {!pdfFile ? (
        <div className="flex w-full justify-center">
          <Button
            variant="outline"
            className="w-fit gap-2"
            onClick={() => pdfInputRef.current?.click()}
          >
            <UploadIcon />
            PDF Timetable hochladen
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setPdfDialogOpen(true)}
            className="w-fit cursor-zoom-in overflow-hidden rounded border shadow-sm transition-opacity hover:opacity-80"
          >
            <PdfThumbnail file={pdfFile} width={320} />
          </button>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{pdfFile.name}</p>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => pdfInputRef.current?.click()}
            >
              Ändern
            </Button>
          </div>

          <PdfViewerDialog
            file={pdfFile}
            open={pdfDialogOpen}
            onOpenChange={setPdfDialogOpen}
          />

          <PdfSectionPreviewDialog
            file={pdfFile}
            areaConfig={areaConfig}
            open={previewDay !== null}
            onOpenChange={(o) => !o && setPreviewDay(null)}
            initialDay={previewDay ?? "mon"}
          />
        </div>
      )}

      {isExtracting && (
        <p className="text-sm text-muted-foreground">Extracting text…</p>
      )}

      {/* ── Shift cards ──────────────────────────────────────────────── */}
      {mappedEntry && (
        <div className="flex flex-col justify-center gap-12">
          <div className="flex w-full flex-col items-center justify-center gap-6">
            <Field className="max-w-80">
              <FieldLabel htmlFor="event-title">Ereignistitel</FieldLabel>
              <Input
                id="event-title"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
              />
            </Field>

            <Field className="max-w-80">
              <FieldLabel htmlFor="notes-prefix">Notizen-Präfix</FieldLabel>
              <Input
                id="notes-prefix"
                value={notesPrefix}
                onChange={(e) => setNotesPrefix(e.target.value)}
              />
            </Field>

            <Button
              size="lg"
              className="max-w-56"
              onClick={() => {
                const entries = DAY_LABELS.flatMap(({ key, label }) => {
                  const shift = shifts[key]
                  if (!shift || (!shift.startTime && !shift.endTime)) return []
                  return [{ key, label, shift }]
                })
                downloadIcs(
                  generateIcs(entries, { eventTitle, notesPrefix }),
                  icsFilename(entries)
                )
              }}
            >
              In Kalender exportieren
            </Button>
          </div>

          {/* Desktop: wrapping week table, min 180 px per day */}
          <div className="hidden [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))] md:grid md:gap-2">
            {DAY_LABELS.map(({ key, label }) => {
              const shift = shifts[key]
              const hasShift = shift && (shift.startTime || shift.endTime)
              return (
                <div
                  key={`${key}-${loadCount}`}
                  className="flex min-w-0 flex-col gap-1.5"
                >
                  <p className="text-center text-xs font-medium text-muted-foreground">
                    {label}
                  </p>
                  {hasShift ? (
                    <ShiftCard
                      dayLabel={label}
                      {...shift}
                      onChange={(updated) => updateShift(key, updated)}
                      onPreview={() => setPreviewDay(key)}
                    />
                  ) : (
                    <div className="grow rounded-xl border border-dashed" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Mobile: vertical stack with day labels */}
          <div className="flex flex-col gap-2 md:hidden">
            {DAY_LABELS.map(({ key, label }) => {
              const shift = shifts[key]
              const hasShift = shift && (shift.startTime || shift.endTime)
              return (
                <div
                  key={`${key}-${loadCount}`}
                  className="flex flex-col gap-1.5"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {label}
                  </p>
                  {hasShift ? (
                    <ShiftCard
                      dayLabel={label}
                      {...shift}
                      onChange={(updated) => updateShift(key, updated)}
                      onPreview={() => setPreviewDay(key)}
                    />
                  ) : (
                    <div className="h-6 rounded-lg border border-dashed" />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex w-full items-center justify-center md:hidden">
            <Button
              size="lg"
              className="max-w-56"
              onClick={() => {
                const entries = DAY_LABELS.flatMap(({ key, label }) => {
                  const shift = shifts[key]
                  if (!shift || (!shift.startTime && !shift.endTime)) return []
                  return [{ key, label, shift }]
                })
                downloadIcs(
                  generateIcs(entries, { eventTitle, notesPrefix }),
                  icsFilename(entries)
                )
              }}
            >
              In Kalender exportieren
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
