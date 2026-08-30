import type { ShiftDTO } from "@/types/workPlanTypes"

export interface ShiftExportEntry {
  key: string
  label: string
  shift: ShiftDTO
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

// Floating local time — no timezone suffix, so the event lands in the
// user's local timezone on every platform (RFC 5545 §3.3.5).
function fmtLocal(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  )
}

// DTSTAMP must be UTC.
function fmtUtc(d: Date): string {
  return d.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z"
}

// ISO 8601 week number
function isoWeek(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const jan4 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
}

export function icsFilename(entries: ShiftExportEntry[]): string {
  const first = entries.find((e) => e.shift.startTime)?.shift.startTime
  if (!first) return "arbeitsplan.ics"
  return `Plan_KW${isoWeek(first)}.ics`
}

export interface IcsConfig {
  /** Fallback SUMMARY used for shifts without their own title. */
  eventTitle?: string
  /** Prefixed to the notes field to form DESCRIPTION. */
  notePrefix?: string
}

export function generateIcs(entries: ShiftExportEntry[], config: IcsConfig = {}): string {
  const { eventTitle = "Arbeiten Flora", notePrefix = "" } = config
  const dtstamp = fmtUtc(new Date())

  const events = entries
    .filter((e) => e.shift.startTime && e.shift.endTime)
    .map(({ key, shift }) => {
      const uid = `${key}-${fmtLocal(shift.startTime!)}-${Date.now()}@arbeitsplan`

      const lines = [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${fmtLocal(shift.startTime!)}`,
        `DTEND:${fmtLocal(shift.endTime!)}`,
        `SUMMARY:${shift.title || eventTitle}`,
      ]
      if (shift.notes) lines.push(`DESCRIPTION:${notePrefix}${shift.notes}`)
      lines.push("END:VEVENT")
      return lines.join("\r\n")
    })

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ArbeitsplanManager//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n")
}

export function downloadIcs(content: string, filename = "arbeitsplan.ics") {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
