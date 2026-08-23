import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Document, Page, pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

// ─── Labels ──────────────────────────────────────────────────────────────────

const BOX_LABELS = [
  "Employee",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
  "Notes",
] as const
type BoxLabel = (typeof BOX_LABELS)[number]

const DAY_LABELS: ReadonlyArray<BoxLabel> = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
]

const SUB_FIELD_LABELS = [
  "date",
  "start-time",
  "end-time",
  "time-sum",
  "notes",
] as const
type SubFieldLabel = (typeof SUB_FIELD_LABELS)[number]

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * All coordinates are in PDF points:
 *   x – from left edge of page
 *   y – from bottom edge of page  (matches pdfjs transform[5])
 *   w, h – width / height in points
 *
 * SubBox coordinates are absolute (same space as the parent Box),
 * not relative to the parent.
 */
interface SubBox {
  id: SubFieldLabel
  x: number
  y: number
  w: number
  h: number
}

interface Box {
  id: BoxLabel
  x: number
  y: number
  w: number
  h: number
  subBoxes?: SubBox[]
}

type Handle = "nw" | "ne" | "sw" | "se"

interface DragState {
  kind: "move" | "resize"
  boxId: BoxLabel
  handle?: Handle
  startMouseX: number
  startMouseY: number
  startBox: { x: number; y: number; w: number; h: number }
}

interface SubDragState {
  kind: "move" | "resize"
  dayId: BoxLabel
  subId: SubFieldLabel
  handle?: Handle
  startMouseX: number
  startMouseY: number
  startBox: { x: number; y: number; w: number; h: number }
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS: Record<BoxLabel, { bg: string; border: string }> = {
  Employee: { bg: "rgba(59,130,246,0.20)", border: "rgb(59,130,246)" },
  Mon: { bg: "rgba(16,185,129,0.20)", border: "rgb(16,185,129)" },
  Tue: { bg: "rgba(245,158,11,0.20)", border: "rgb(245,158,11)" },
  Wed: { bg: "rgba(239,68,68,0.20)", border: "rgb(239,68,68)" },
  Thu: { bg: "rgba(139,92,246,0.20)", border: "rgb(139,92,246)" },
  Fri: { bg: "rgba(236,72,153,0.20)", border: "rgb(236,72,153)" },
  Sat: { bg: "rgba(6,182,212,0.20)", border: "rgb(6,182,212)" },
  Sun: { bg: "rgba(249,115,22,0.20)", border: "rgb(249,115,22)" },
  Notes: { bg: "rgba(107,114,128,0.20)", border: "rgb(107,114,128)" },
}

const SUB_COLORS: Record<SubFieldLabel, { bg: string; border: string }> = {
  date: { bg: "rgba(99,102,241,0.20)", border: "rgb(99,102,241)" },
  "start-time": { bg: "rgba(20,184,166,0.20)", border: "rgb(20,184,166)" },
  "end-time": { bg: "rgba(251,146,60,0.20)", border: "rgb(251,146,60)" },
  "time-sum": { bg: "rgba(168,85,247,0.20)", border: "rgb(168,85,247)" },
  notes: { bg: "rgba(75,85,99,0.20)", border: "rgb(75,85,99)" },
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_PT = 5   // minimum box dimension in PDF points
const DEFAULT_PAGE_W = 841.89  // A4 landscape fallback
const DEFAULT_PAGE_H = 595.28

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Default sub-boxes for a day column, placed in the same PDF coordinate space.
 * Strips run top-to-bottom visually (high-y to low-y in PDF coords).
 */
function defaultSubBoxes(
  px: number,
  py: number,
  pw: number,
  ph: number,
): SubBox[] {
  const count = SUB_FIELD_LABELS.length
  const stripH = ph / count
  return SUB_FIELD_LABELS.map((id, i) => ({
    id,
    x: px,
    // i=0 → top strip (highest y in PDF); i=count-1 → bottom strip (lowest y)
    y: py + ph - (i + 1) * stripH,
    w: pw,
    h: stripH,
  }))
}

function defaultBoxes(pageW: number, pageH: number): Box[] {
  const yBottom = pageH * 0.25
  const h = pageH * 0.25
  const employeeW = Math.round(pageW * 0.12)
  const notesW = Math.round(pageW * 0.15)
  const gap = Math.round(pageW * 0.005)
  const dayW = Math.floor((pageW - employeeW - notesW - gap * 3) / 7)
  const days: BoxLabel[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const startX = gap + employeeW + gap

  return [
    { id: "Employee", x: gap, y: yBottom, w: employeeW, h },
    ...days.map((day, i) => {
      const x = startX + i * dayW
      return {
        id: day,
        x,
        y: yBottom,
        w: dayW - 2,
        h,
        subBoxes: defaultSubBoxes(x, yBottom, dayW - 2, h),
      }
    }),
    { id: "Notes", x: pageW - notesW - gap, y: yBottom, w: notesW, h },
  ]
}

/** Clamp sub-box so it stays within its parent box (absolute PDF coords). */
function clampSub(sub: SubBox, parent: Box): SubBox {
  const x = Math.max(parent.x, Math.min(sub.x, parent.x + parent.w - MIN_PT))
  const w = Math.max(MIN_PT, Math.min(sub.w, parent.x + parent.w - x))
  const y = Math.max(parent.y, Math.min(sub.y, parent.y + parent.h - MIN_PT))
  const h = Math.max(MIN_PT, Math.min(sub.h, parent.y + parent.h - y))
  return { ...sub, x, y, w, h }
}

/**
 * Convert a PDF-coordinate box to CSS positioning inside the canvas div.
 *
 * PDF origin is bottom-left; CSS origin is top-left.
 * fullScale = (containerPxWidth / pageNativeWidth) * zoom
 */
function pdfToCss(
  pdfX: number,
  pdfY: number,
  pdfW: number,
  pdfH: number,
  fullScale: number,
  pageH: number,
) {
  return {
    left: pdfX * fullScale,
    top: (pageH - pdfY - pdfH) * fullScale,
    width: pdfW * fullScale,
    height: pdfH * fullScale,
  }
}

/**
 * Apply a resize handle delta (in PDF points) to a box.
 * Handles fix the opposite corner and adjust the dragged corner.
 */
function applyResize(
  handle: Handle,
  s: { x: number; y: number; w: number; h: number },
  dxPdf: number,
  dyPdf: number,
): { x: number; y: number; w: number; h: number } {
  switch (handle) {
    // SE: fix NW corner (s.x, s.y+s.h). Right and bottom edges move.
    case "se": {
      const newW = Math.max(MIN_PT, s.w + dxPdf)
      const newH = Math.max(MIN_PT, s.h - dyPdf)
      return { x: s.x, y: (s.y + s.h) - newH, w: newW, h: newH }
    }
    // SW: fix NE corner (s.x+s.w, s.y+s.h). Left and bottom edges move.
    case "sw": {
      const newW = Math.max(MIN_PT, s.w - dxPdf)
      const newH = Math.max(MIN_PT, s.h - dyPdf)
      return { x: (s.x + s.w) - newW, y: (s.y + s.h) - newH, w: newW, h: newH }
    }
    // NE: fix SW corner (s.x, s.y). Right and top edges move.
    case "ne": {
      const newW = Math.max(MIN_PT, s.w + dxPdf)
      const newH = Math.max(MIN_PT, s.h + dyPdf)
      return { x: s.x, y: s.y, w: newW, h: newH }
    }
    // NW: fix SE corner (s.x+s.w, s.y). Left and top edges move.
    case "nw": {
      const newW = Math.max(MIN_PT, s.w - dxPdf)
      const newH = Math.max(MIN_PT, s.h + dyPdf)
      return { x: (s.x + s.w) - newW, y: s.y, w: newW, h: newH }
    }
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BoundingBoxEditor() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [containerW, setContainerW] = useState(900)
  const [pageNativeWidth, setPageNativeWidth] = useState(DEFAULT_PAGE_W)
  const [pageNativeHeight, setPageNativeHeight] = useState(DEFAULT_PAGE_H)
  const [boxes, setBoxes] = useState<Box[]>(() =>
    defaultBoxes(DEFAULT_PAGE_W, DEFAULT_PAGE_H),
  )
  const [selected, setSelected] = useState<BoxLabel | null>(null)
  const [showDetail, setShowDetail] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [editingDay, setEditingDay] = useState<BoxLabel | null>(null)
  const [selectedSub, setSelectedSub] = useState<SubFieldLabel | null>(null)

  const zoomRef = useRef(1)
  const dragRef = useRef<DragState | null>(null)
  const subDragRef = useRef<SubDragState | null>(null)
  const didDragRef = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // baseScale: PDF points → canvas pixels at zoom=1
  const baseScale = containerW / pageNativeWidth
  // fullScale: PDF points → screen pixels (includes zoom)
  const fullScale = baseScale * zoom

  function changeZoom(next: number) {
    const v = Math.round(Math.min(3, Math.max(0.25, next)) * 100) / 100
    zoomRef.current = v
    setZoom(v)
  }

  useLayoutEffect(() => {
    const w = wrapperRef.current?.clientWidth
    if (w) setContainerW(w)
  }, [])

  // ── file upload ────────────────────────────────────────────────────────────
  function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file?.type === "application/pdf") setPdfFile(file)
  }

  // ── drag start helpers ─────────────────────────────────────────────────────
  function startMove(e: React.MouseEvent, id: BoxLabel) {
    e.stopPropagation()
    didDragRef.current = false
    setSelected(id)
    const box = boxes.find((b) => b.id === id)!
    dragRef.current = {
      kind: "move",
      boxId: id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBox: { x: box.x, y: box.y, w: box.w, h: box.h },
    }
  }

  function startResize(e: React.MouseEvent, id: BoxLabel, handle: Handle) {
    e.stopPropagation()
    didDragRef.current = false
    setSelected(id)
    const box = boxes.find((b) => b.id === id)!
    dragRef.current = {
      kind: "resize",
      boxId: id,
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBox: { x: box.x, y: box.y, w: box.w, h: box.h },
    }
  }

  function startSubMove(e: React.MouseEvent, dayId: BoxLabel, subId: SubFieldLabel) {
    e.stopPropagation()
    didDragRef.current = false
    setSelectedSub(subId)
    const sub = boxes.find((b) => b.id === dayId)!.subBoxes!.find((s) => s.id === subId)!
    subDragRef.current = {
      kind: "move",
      dayId,
      subId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBox: { x: sub.x, y: sub.y, w: sub.w, h: sub.h },
    }
  }

  function startSubResize(
    e: React.MouseEvent,
    dayId: BoxLabel,
    subId: SubFieldLabel,
    handle: Handle,
  ) {
    e.stopPropagation()
    didDragRef.current = false
    setSelectedSub(subId)
    const sub = boxes.find((b) => b.id === dayId)!.subBoxes!.find((s) => s.id === subId)!
    subDragRef.current = {
      kind: "resize",
      dayId,
      subId,
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBox: { x: sub.x, y: sub.y, w: sub.w, h: sub.h },
    }
  }

  // ── mouse events ───────────────────────────────────────────────────────────
  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const z = zoomRef.current
      const fs = (containerW / pageNativeWidth) * z

      if (dragRef.current || subDragRef.current) {
        const ref = dragRef.current ?? subDragRef.current!
        if (
          Math.abs(e.clientX - ref.startMouseX) > 4 ||
          Math.abs(e.clientY - ref.startMouseY) > 4
        )
          didDragRef.current = true
      }

      // Convert screen-pixel delta to PDF-point delta (y is flipped)
      const toPdf = (dxScreen: number, dyScreen: number) => ({
        dx: dxScreen / fs,
        dy: -dyScreen / fs,
      })

      // ── sub-box drag ───────────────────────────────────────────────────────
      const subDrag = subDragRef.current
      if (subDrag) {
        const { dx, dy } = toPdf(
          e.clientX - subDrag.startMouseX,
          e.clientY - subDrag.startMouseY,
        )
        const s = subDrag.startBox
        setBoxes((prev) =>
          prev.map((box) => {
            if (box.id !== subDrag.dayId || !box.subBoxes) return box
            return {
              ...box,
              subBoxes: box.subBoxes.map((sub) => {
                if (sub.id !== subDrag.subId) return sub
                let next: SubBox
                if (subDrag.kind === "move") {
                  next = { ...sub, x: s.x + dx, y: s.y + dy }
                } else {
                  const r = applyResize(subDrag.handle!, s, dx, dy)
                  next = { ...sub, ...r }
                }
                return clampSub(next, box)
              }),
            }
          }),
        )
        return
      }

      // ── parent box drag ────────────────────────────────────────────────────
      const drag = dragRef.current
      if (!drag) return
      const { dx, dy } = toPdf(
        e.clientX - drag.startMouseX,
        e.clientY - drag.startMouseY,
      )
      const s = drag.startBox
      setBoxes((prev) =>
        prev.map((box) => {
          if (box.id !== drag.boxId) return box
          if (drag.kind === "move") return { ...box, x: s.x + dx, y: s.y + dy }
          const r = applyResize(drag.handle!, s, dx, dy)
          return { ...box, ...r }
        }),
      )
    },
    [containerW, pageNativeWidth],
  )

  const onMouseUp = useCallback(() => {
    dragRef.current = null
    subDragRef.current = null
  }, [])

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // ── export / import ───────────────────────────────────────────────────────
  function exportJSON() {
    // Coordinates are already in PDF points — export directly.
    const blob = new Blob([JSON.stringify(boxes, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "bounding-boxes.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        setBoxes(JSON.parse(ev.target?.result as string) as Box[])
      } catch {
        alert("Invalid JSON file.")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  // ── coordinate editors ────────────────────────────────────────────────────
  function updateBox(id: BoxLabel, field: "x" | "y" | "xEnd" | "yEnd", value: number) {
    setBoxes((prev) =>
      prev.map((box) => {
        if (box.id !== id) return box
        switch (field) {
          case "x": return { ...box, x: value }
          case "y": return { ...box, y: value }
          case "xEnd": return { ...box, w: Math.max(MIN_PT, value - box.x) }
          case "yEnd": return { ...box, h: Math.max(MIN_PT, value - box.y) }
        }
      }),
    )
  }

  function updateSubBox(
    dayId: BoxLabel,
    subId: SubFieldLabel,
    field: "x" | "y" | "xEnd" | "yEnd",
    value: number,
  ) {
    setBoxes((prev) =>
      prev.map((box) => {
        if (box.id !== dayId || !box.subBoxes) return box
        return {
          ...box,
          subBoxes: box.subBoxes.map((sub) => {
            if (sub.id !== subId) return sub
            let next: SubBox
            switch (field) {
              case "x": next = { ...sub, x: value }; break
              case "y": next = { ...sub, y: value }; break
              case "xEnd": next = { ...sub, w: Math.max(MIN_PT, value - sub.x) }; break
              case "yEnd": next = { ...sub, h: Math.max(MIN_PT, value - sub.y) }; break
              default: next = sub
            }
            return clampSub(next, box)
          }),
        }
      }),
    )
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const activeDayBox = editingDay ? boxes.find((b) => b.id === editingDay) : null

  // ── render helpers ────────────────────────────────────────────────────────
  function CoordInputs({
    box,
    onUpdate,
  }: {
    box: { x: number; y: number; w: number; h: number }
    onUpdate: (field: "x" | "y" | "xEnd" | "yEnd", v: number) => void
  }) {
    return (
      <>
        <div className="flex gap-1">
          {(["x", "y"] as const).map((f) => (
            <label key={f} className="flex items-center gap-0.5 text-[10px] text-gray-500">
              {f.toUpperCase()}
              <input
                type="number"
                className="w-14 rounded border px-1 py-0.5 text-[10px] tabular-nums"
                value={Math.round(box[f])}
                onChange={(e) => {
                  const v = e.target.valueAsNumber
                  if (!isNaN(v)) onUpdate(f, v)
                }}
              />
            </label>
          ))}
        </div>
        <div className="flex gap-1">
          {(["xEnd", "yEnd"] as const).map((f) => (
            <label key={f} className="flex items-center gap-0.5 text-[10px] text-gray-500">
              {f === "xEnd" ? "X2" : "Y2"}
              <input
                type="number"
                className="w-14 rounded border px-1 py-0.5 text-[10px] tabular-nums"
                value={Math.round(f === "xEnd" ? box.x + box.w : box.y + box.h)}
                onChange={(e) => {
                  const v = e.target.valueAsNumber
                  if (!isNaN(v)) onUpdate(f, v)
                }}
              />
            </label>
          ))}
        </div>
      </>
    )
  }

  function ResizeHandles({
    onHandle,
    borderColor,
  }: {
    onHandle: (e: React.MouseEvent, h: Handle) => void
    borderColor: string
  }) {
    return (
      <>
        {(["nw", "ne", "sw", "se"] as const).map((h) => (
          <div
            key={h}
            className="absolute h-3 w-3 rounded-sm border-2 bg-white"
            style={{
              borderColor,
              top: h.startsWith("n") ? -5 : undefined,
              bottom: h.startsWith("s") ? -5 : undefined,
              left: h.endsWith("w") ? -5 : undefined,
              right: h.endsWith("e") ? -5 : undefined,
              cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
              zIndex: 20,
            }}
            onMouseDown={(e) => onHandle(e, h)}
          />
        ))}
      </>
    )
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-svh flex-col gap-4 overflow-hidden p-6">
      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" htmlFor="pdf-bb-upload">
            Upload PDF
          </label>
          <input
            id="pdf-bb-upload"
            type="file"
            accept="application/pdf"
            onChange={handlePdfUpload}
            className="text-sm"
          />
        </div>

        <div className="flex items-center gap-1 rounded border px-1">
          <button
            onClick={() => changeZoom(zoom - 0.25)}
            className="px-2 py-1 text-sm font-medium hover:bg-gray-100"
            title="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-xs tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => changeZoom(zoom + 0.25)}
            className="px-2 py-1 text-sm font-medium hover:bg-gray-100"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => changeZoom(1)}
            className="border-l px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            Reset
          </button>
        </div>

        <div className="ml-auto flex gap-2">
          <label className="cursor-pointer rounded border px-3 py-1.5 text-xs font-medium hover:bg-gray-50">
            Import JSON
            <input type="file" accept="application/json" onChange={importJSON} className="hidden" />
          </label>
          <button
            onClick={exportJSON}
            className="rounded border bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* ── breadcrumb ──────────────────────────────────────────────────── */}
      {editingDay && (
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => { setEditingDay(null); setSelectedSub(null) }}
            className="flex items-center gap-1 rounded border px-2 py-1 hover:bg-gray-50"
          >
            ← All zones
          </button>
          <span className="text-gray-400">/</span>
          <span
            className="rounded border px-2 py-1 font-medium"
            style={{ borderColor: COLORS[editingDay].border, background: COLORS[editingDay].bg }}
          >
            {editingDay}
          </span>
        </div>
      )}

      {/* ── zone cards ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {editingDay === null ? (
          <>
            {BOX_LABELS.map((label) => {
              const box = boxes.find((b) => b.id === label)!
              const c = COLORS[label]
              const isDay = DAY_LABELS.includes(label)
              return (
                <div key={label} className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      if (isDay) { setEditingDay(label); setSelected(null) }
                    }}
                    className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${isDay ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                    style={{ borderColor: c.border }}
                  >
                    <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: c.border }} />
                    {label}
                  </button>
                  {showDetail && (
                    <div className="flex flex-col gap-0.5 rounded border p-1.5" style={{ borderColor: c.border }}>
                      <CoordInputs box={box} onUpdate={(f, v) => updateBox(label, f, v)} />
                    </div>
                  )}
                </div>
              )
            })}
            <button
              onClick={() => setShowDetail((v) => !v)}
              className="self-start rounded border px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
            >
              {showDetail ? "Hide" : "Show"} details
            </button>
          </>
        ) : (
          <>
            {SUB_FIELD_LABELS.map((subId) => {
              const sub = activeDayBox?.subBoxes?.find((s) => s.id === subId)
              const c = SUB_COLORS[subId]
              if (!sub) return null
              return (
                <div key={subId} className="flex flex-col gap-1">
                  <button
                    onClick={() => setSelectedSub((s) => (s === subId ? null : subId))}
                    className="flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors"
                    style={{ borderColor: c.border, background: selectedSub === subId ? c.bg : undefined }}
                  >
                    <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: c.border }} />
                    {subId}
                  </button>
                  {showDetail && (
                    <div className="flex flex-col gap-0.5 rounded border p-1.5" style={{ borderColor: c.border }}>
                      <CoordInputs box={sub} onUpdate={(f, v) => updateSubBox(editingDay, subId, f, v)} />
                    </div>
                  )}
                </div>
              )
            })}
            <button
              onClick={() => setShowDetail((v) => !v)}
              className="self-start rounded border px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
            >
              {showDetail ? "Hide" : "Show"} details
            </button>
          </>
        )}
      </div>

      {/* ── canvas ──────────────────────────────────────────────────────── */}
      <div ref={wrapperRef} className="flex-1 overflow-auto">
        {pdfFile ? (
          <div
            className="relative overflow-hidden rounded border shadow-sm select-none"
            style={{ width: containerW * zoom, height: pageNativeHeight * fullScale }}
            onMouseDown={() => { setSelected(null); setSelectedSub(null) }}
          >
            <Document file={pdfFile}>
              <Page
                pageNumber={1}
                width={containerW * zoom}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(page) => {
                  const vp = page.getViewport({ scale: 1 })
                  setPageNativeWidth(vp.width)
                  setPageNativeHeight(vp.height)
                }}
              />
            </Document>

            {boxes.map((box) => {
              const c = COLORS[box.id]
              const isSelected = selected === box.id
              const isEditing = editingDay === box.id
              const isDay = DAY_LABELS.includes(box.id)

              if (editingDay && !isEditing) return null

              const css = pdfToCss(box.x, box.y, box.w, box.h, fullScale, pageNativeHeight)

              return (
                <div
                  key={box.id}
                  className="absolute"
                  style={{
                    ...css,
                    background: isEditing ? "transparent" : c.bg,
                    border: `2px solid ${c.border}`,
                    cursor: isEditing ? "default" : "move",
                    zIndex: isSelected ? 10 : 1,
                    boxShadow: isSelected ? `0 0 0 2px ${c.border}` : undefined,
                  }}
                  onMouseDown={isEditing ? undefined : (e) => startMove(e, box.id)}
                  onClick={
                    isDay && !isEditing
                      ? () => {
                          if (!didDragRef.current) {
                            setEditingDay(box.id)
                            setSelected(null)
                          }
                        }
                      : undefined
                  }
                >
                  {!isEditing && (
                    <span
                      className="pointer-events-none absolute top-0.5 left-1 text-[10px] leading-none font-bold"
                      style={{ color: c.border }}
                    >
                      {box.id}
                    </span>
                  )}

                  {!isEditing && (
                    <ResizeHandles
                      borderColor={c.border}
                      onHandle={(e, h) => startResize(e, box.id, h)}
                    />
                  )}

                  {/* Sub-boxes rendered inside the parent div with relative CSS positioning */}
                  {isEditing &&
                    box.subBoxes?.map((sub) => {
                      const sc = SUB_COLORS[sub.id]
                      const isSubSel = selectedSub === sub.id
                      // Convert absolute sub coords to position relative to parent div
                      const subLeft = (sub.x - box.x) * fullScale
                      const subTop = ((box.y + box.h) - (sub.y + sub.h)) * fullScale
                      const subW = sub.w * fullScale
                      const subH = sub.h * fullScale
                      return (
                        <div
                          key={sub.id}
                          className="absolute"
                          style={{
                            left: subLeft,
                            top: subTop,
                            width: subW,
                            height: subH,
                            background: sc.bg,
                            border: `2px solid ${sc.border}`,
                            cursor: "move",
                            zIndex: isSubSel ? 10 : 1,
                            boxShadow: isSubSel ? `0 0 0 2px ${sc.border}` : undefined,
                          }}
                          onMouseDown={(e) => startSubMove(e, box.id, sub.id)}
                        >
                          <span
                            className="pointer-events-none absolute top-0.5 left-1 text-[10px] leading-none font-bold"
                            style={{ color: sc.border }}
                          >
                            {sub.id}
                          </span>
                          <ResizeHandles
                            borderColor={sc.border}
                            onHandle={(e, h) => startSubResize(e, box.id, sub.id, h)}
                          />
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded border border-dashed text-sm text-gray-400">
            Upload a PDF to start editing bounding boxes
          </div>
        )}
      </div>
    </div>
  )
}
