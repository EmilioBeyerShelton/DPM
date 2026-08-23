import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ShiftDTO } from "@/types/workPlanTypes"

export interface ShiftCardProps extends ShiftDTO {
  dayLabel?: string
  onChange?: (updated: ShiftDTO) => void
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function toDateInput(d: Date | undefined): string {
  if (!d) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function toTimeInput(d: Date | undefined): string {
  if (!d) return ""
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function toSumInput(n: number | undefined): string {
  return n != null ? String(n).replace(".", ",") : ""
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShiftCard({
  dayLabel,
  onChange,
  date,
  startTime,
  endTime,
  timeSum,
  notes,
}: ShiftCardProps) {
  const [dateVal, setDateVal] = useState(toDateInput(date))
  const [startVal, setStartVal] = useState(toTimeInput(startTime))
  const [endVal, setEndVal] = useState(toTimeInput(endTime))
  const sumVal = toSumInput(timeSum)
  const [notesVal, setNotesVal] = useState(notes ?? "")

  function buildDTO(): ShiftDTO {
    const parsedDate = dateVal ? new Date(dateVal + "T00:00:00") : undefined

    let parsedStart: Date | undefined
    if (parsedDate && startVal) {
      const [h, m] = startVal.split(":").map(Number)
      parsedStart = new Date(parsedDate)
      parsedStart.setHours(h, m, 0, 0)
    }

    let parsedEnd: Date | undefined
    if (parsedDate && endVal) {
      const [h, m] = endVal.split(":").map(Number)
      parsedEnd = new Date(parsedDate)
      parsedEnd.setHours(h, m, 0, 0)
      if (parsedStart && parsedEnd <= parsedStart) {
        parsedEnd = new Date(parsedEnd.getTime() + 24 * 60 * 60 * 1000)
      }
    }

    const rawSum = parseFloat(sumVal.replace(",", "."))
    return {
      date: parsedDate,
      startTime: parsedStart,
      endTime: parsedEnd,
      timeSum: isNaN(rawSum) ? undefined : rawSum,
      notes: notesVal.trim() || undefined,
    }
  }

  const commit = () => onChange?.(buildDTO())
  const id = dayLabel ?? "shift"

  return (
    <Card className="w-full min-w-0">
      {/* ── Header: day · date · Σ ─────────────────────────────────── */}
      <CardHeader className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Input
            id={`${id}-date`}
            type="date"
            value={dateVal}
            onChange={(e) => setDateVal(e.target.value)}
            onBlur={commit}
            className="h-6 min-w-0 flex-1 text-xs"
          />
        </div>
      </CardHeader>

      {/* ── Content: Von / Bis / Notizen ───────────────────────────── */}
      <CardContent className="px-3 pt-0 pb-3">
        <div className="flex gap-2">
          <div className="grid flex-1 gap-0.5">
            <Label
              htmlFor={`${id}-start`}
              className="text-xs font-normal text-muted-foreground"
            >
              Von
            </Label>
            <Input
              id={`${id}-start`}
              type="time"
              value={startVal}
              onChange={(e) => setStartVal(e.target.value)}
              onBlur={commit}
              className="h-6 w-full text-xs"
            />
          </div>

          <div className="grid flex-1 gap-0.5">
            <Label
              htmlFor={`${id}-end`}
              className="text-xs font-normal text-muted-foreground"
            >
              Bis
            </Label>
            <Input
              id={`${id}-end`}
              type="time"
              value={endVal}
              onChange={(e) => setEndVal(e.target.value)}
              onBlur={commit}
              className="h-6 w-full text-xs"
            />
          </div>
        </div>

        <Input
          id={`${id}-notes`}
          type="text"
          value={notesVal}
          onChange={(e) => setNotesVal(e.target.value)}
          onBlur={commit}
          placeholder="Notizen"
          className="mt-2 h-6 w-full text-xs"
        />
        <div className="-mb-2 flex items-center justify-center pt-2">
          <div className="text-gray-300">{sumVal} h</div>
        </div>
      </CardContent>
    </Card>
  )
}
