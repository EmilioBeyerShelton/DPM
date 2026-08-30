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

function toInput(d: Date | undefined): string {
  if (!d) return ""
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function toSumInput(n: number | undefined): string {
  return n != null ? String(n).replace(".", ",") : ""
}

/** Actual shift duration in hours, derived from the Von/Bis inputs (overnight-safe). */
function diffHours(startStr: string, endStr: string): number | undefined {
  if (!startStr || !endStr) return undefined
  const [sh, sm] = startStr.split(":").map(Number)
  const [eh, em] = endStr.split(":").map(Number)
  let minutes = eh * 60 + em - (sh * 60 + sm)
  if (minutes <= 0) minutes += 24 * 60
  return Math.round((minutes / 60) * 100) / 100
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShiftCard({
  dayLabel,
  onChange,
  date,
  startTime,
  endTime,
  timeSum,
  title,
  notes,
  notes2,
}: ShiftCardProps) {
  const [dateVal, setDateVal] = useState(toDateInput(date))
  const [startVal, setStartVal] = useState(toInput(startTime))
  const [endVal, setEndVal] = useState(toInput(endTime))
  const sumVal = toSumInput(timeSum)
  const actualVal = toSumInput(diffHours(startVal, endVal))
  const [titleVal, setTitleVal] = useState(title ?? "")
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
      title: titleVal.trim() || undefined,
      notes: notesVal.trim() || undefined,
      // notes2 is not user-editable here — pass the extracted value through unchanged.
      notes2,
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
            className=""
          />
        </div>
        <div className="mb-2 grid gap-0.5">
          <Label
            htmlFor={`${id}-title`}
            className="text-xs font-normal text-muted-foreground"
          >
            Titel
          </Label>
          <Input
            id={`${id}-title`}
            type="text"
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onBlur={commit}
            placeholder="Ereignistitel"
            className="w-full"
          />
        </div>
      </CardHeader>

      {/* ── Content: Titel / Von / Bis / Notizen ───────────────────── */}
      <CardContent className="overflow-x-hidden px-3 pt-0 pb-3">
        <div className="flex w-full flex-row justify-evenly gap-2">
          <div className="grid gap-0.5">
            <Label
              htmlFor={`${id}-start`}
              className="text-xs font-normal text-muted-foreground"
            >
              Von
            </Label>
            <Input
              id={`${id}-start`}
              value={startVal}
              onChange={(e) => setStartVal(e.target.value)}
              onBlur={commit}
            />
          </div>
          <div className="self-center">-</div>

          <div className="grid gap-0.5">
            <Label
              htmlFor={`${id}-end`}
              className="text-xs font-normal text-muted-foreground"
            >
              Bis
            </Label>
            <Input
              id={`${id}-end`}
              value={endVal}
              onChange={(e) => setEndVal(e.target.value)}
              onBlur={commit}
            />
          </div>
        </div>
        <div className="mt-2 grid flex-1 gap-0.5">
          <Label
            htmlFor={`${id}-notes`}
            className="text-xs font-normal text-muted-foreground"
          >
            Notiz
          </Label>
          <Input
            id={`${id}-notes`}
            type="text"
            value={notesVal}
            onChange={(e) => setNotesVal(e.target.value)}
            onBlur={commit}
            placeholder="Notizen"
            className="w-full"
          />
        </div>
        <div className="-mb-2 flex items-center justify-center gap-4 pt-2 text-xs">
          <div className="text-gray-300">Soll: {sumVal} h</div>
          <div className="text-gray-300">Ist: {actualVal} h</div>
        </div>
      </CardContent>
    </Card>
  )
}
