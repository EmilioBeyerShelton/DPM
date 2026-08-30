import type { DayEntry, ShiftDTO } from "@/types/workPlanTypes"

const GERMAN_MONTHS: Record<string, number> = {
  januar: 0,
  februar: 1,
  märz: 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  dezember: 11,
}

/**
 * Parse German long-form dates: "30. Dezember 2024", "2. Januar 2025".
 * Returns local midnight on that date.
 */
export function parseDate(str: string): Date | undefined {
  const m = str.match(/(\d{1,2})\.\s+(\w+)\s+(\d{4})/)
  if (!m) return undefined
  const day = parseInt(m[1], 10)
  const month = GERMAN_MONTHS[m[2].toLowerCase()]
  const year = parseInt(m[3], 10)
  if (month === undefined) return undefined
  const d = new Date(year, month, day)
  return isNaN(d.getTime()) ? undefined : d
}

/**
 * Parse "HH:MM" or "H:MM" found anywhere in a string.
 */
export function parseTimeOfDay(str: string): { hours: number; minutes: number } | undefined {
  const m = str.match(/(\d{1,2}):(\d{2})/)
  if (!m) return undefined
  const hours = parseInt(m[1], 10)
  const minutes = parseInt(m[2], 10)
  if (hours > 23 || minutes > 59) return undefined
  return { hours, minutes }
}

/** Set the time part of a Date copy without mutating the original. */
function withTime(base: Date, timeStr: string): Date | undefined {
  const t = parseTimeOfDay(timeStr)
  if (!t) return undefined
  const d = new Date(base)
  d.setHours(t.hours, t.minutes, 0, 0)
  return d
}

/**
 * Parse a German decimal time-sum string into decimal hours.
 * Accepts: "8,5" → 8.5, "8,50" → 8.5, "8" → 8.0, "7,25" → 7.25
 */
export function parseTimeSum(str: string): number | undefined {
  const value = parseFloat(str.trim().replace(",", "."))
  return isNaN(value) || value < 0 ? undefined : value
}

/**
 * Map a raw DayEntry (strings from PDF) to a typed ShiftDTO.
 *
 * - date: parsed from "DD.MM.YYYY"
 * - startTime / endTime: full Date objects combining the parsed date with
 *   the clock time. If endTime ≤ startTime, one day is added (overnight shift).
 * - timeSum: decimal hours parsed from German comma-decimal notation.
 * - notes / notes2: passed through unchanged.
 */
export function dayEntryToShiftDTO(entry: DayEntry): ShiftDTO {
  const date = entry.date ? parseDate(entry.date) : undefined

  const startTime =
    date && entry.startTime ? withTime(date, entry.startTime) : undefined

  let endTime =
    date && entry.endTime ? withTime(date, entry.endTime) : undefined

  if (startTime && endTime && endTime <= startTime) {
    endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000)
  }

  return {
    date,
    startTime,
    endTime,
    timeSum: entry.timeSum ? parseTimeSum(entry.timeSum) : undefined,
    notes: entry.notes,
    notes2: entry.notes2,
  }
}
