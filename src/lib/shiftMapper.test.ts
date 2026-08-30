import { describe, expect, it } from "vitest"
import {
  dayEntryToShiftDTO,
  parseDate,
  parseTimeOfDay,
  parseTimeSum,
} from "./shiftMapper"

// ─── parseDate ────────────────────────────────────────────────────────────────

describe("parseDate", () => {
  it.each([
    ["30. Dezember 2024", new Date(2024, 11, 30)],
    ["2. Januar 2025",   new Date(2025,  0,  2)],
    ["4. Januar 2025",   new Date(2025,  0,  4)],
    ["31. Dezember 2024", new Date(2024, 11, 31)],
    ["1. Januar 2025",   new Date(2025,  0,  1)],
    ["5. Januar 2025",   new Date(2025,  0,  5)],
    ["3. Januar 2025",   new Date(2025,  0,  3)],
  ])("parses %s", (input, expected) => {
    const result = parseDate(input)
    expect(result).not.toBeUndefined()
    expect(result!.getFullYear()).toBe(expected.getFullYear())
    expect(result!.getMonth()).toBe(expected.getMonth())
    expect(result!.getDate()).toBe(expected.getDate())
  })

  it("returns undefined for an unrecognised string", () => {
    expect(parseDate("not a date")).toBeUndefined()
  })

  it("is case-insensitive for the month name", () => {
    const result = parseDate("15. dezember 2024")
    expect(result?.getMonth()).toBe(11)
  })
})

// ─── parseTimeOfDay ───────────────────────────────────────────────────────────

describe("parseTimeOfDay", () => {
  it("parses 08:00", () => expect(parseTimeOfDay("08:00")).toEqual({ hours: 8, minutes: 0 }))
  it("parses 7:30",  () => expect(parseTimeOfDay("7:30")).toEqual({ hours: 7, minutes: 30 }))
  it("parses 17:45", () => expect(parseTimeOfDay("17:45")).toEqual({ hours: 17, minutes: 45 }))
  it("returns undefined for garbage", () => expect(parseTimeOfDay("abc")).toBeUndefined())
})

// ─── parseTimeSum ─────────────────────────────────────────────────────────────

describe("parseTimeSum", () => {
  it("parses '8,5'  → 8.5",  () => expect(parseTimeSum("8,5")).toBe(8.5))
  it("parses '8,50' → 8.5",  () => expect(parseTimeSum("8,50")).toBe(8.5))
  it("parses '8'    → 8",    () => expect(parseTimeSum("8")).toBe(8))
  it("parses '7,25' → 7.25", () => expect(parseTimeSum("7,25")).toBe(7.25))
  it("returns undefined for empty string", () => expect(parseTimeSum("")).toBeUndefined())
  it("returns undefined for non-numeric",  () => expect(parseTimeSum("abc")).toBeUndefined())
})

// ─── dayEntryToShiftDTO ───────────────────────────────────────────────────────

describe("dayEntryToShiftDTO", () => {
  it("maps a full entry correctly", () => {
    const dto = dayEntryToShiftDTO({
      date: "30. Dezember 2024",
      startTime: "08:00",
      endTime: "16:30",
      timeSum: "8,5",
      notes: "Nachtschicht",
      notes2: "Backstage",
    })
    expect(dto.date).toEqual(new Date(2024, 11, 30))
    expect(dto.startTime).toEqual(new Date(2024, 11, 30, 8, 0))
    expect(dto.endTime).toEqual(new Date(2024, 11, 30, 16, 30))
    expect(dto.timeSum).toBe(8.5)
    expect(dto.notes).toBe("Nachtschicht")
    expect(dto.notes2).toBe("Backstage")
  })

  it("adds one day to endTime when shift crosses midnight", () => {
    const dto = dayEntryToShiftDTO({
      date: "2. Januar 2025",
      startTime: "22:00",
      endTime: "06:00",
    })
    expect(dto.endTime).toEqual(new Date(2025, 0, 3, 6, 0))
  })

  it("returns undefined fields for an empty entry", () => {
    const dto = dayEntryToShiftDTO({})
    expect(dto.date).toBeUndefined()
    expect(dto.startTime).toBeUndefined()
    expect(dto.endTime).toBeUndefined()
    expect(dto.timeSum).toBeUndefined()
    expect(dto.notes).toBeUndefined()
    expect(dto.notes2).toBeUndefined()
  })

  it("passes notes through unchanged", () => {
    const dto = dayEntryToShiftDTO({ notes: "Urlaub" })
    expect(dto.notes).toBe("Urlaub")
  })

  it("passes notes2 through unchanged", () => {
    const dto = dayEntryToShiftDTO({ notes2: "Bühne 2" })
    expect(dto.notes2).toBe("Bühne 2")
  })
})
