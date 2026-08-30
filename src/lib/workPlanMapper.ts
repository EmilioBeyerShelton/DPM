import type { AreaConfig, DayEntry, WorkPlanEntry } from "@/types/workPlanTypes"

export interface TextNode {
  page: number
  str: string
  x: number
  y: number
  width: number
  height: number
}

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
type SubFieldKey = keyof DayEntry

const AREA_TO_DAY: Record<string, DayKey> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
}

const SUBBOX_TO_FIELD: Record<string, SubFieldKey> = {
  date: "date",
  "start-time": "startTime",
  "end-time": "endTime",
  "time-sum": "timeSum",
  notes: "notes",
  "notes-2": "notes2",
}

function contains(
  px: number,
  py: number,
  ax: number,
  ay: number,
  aw: number,
  ah: number,
): boolean {
  return px >= ax && px <= ax + aw && py >= ay && py <= ay + ah
}

/**
 * Maps PDF text nodes to a WorkPlanEntry using the provided area configuration.
 *
 * Two coordinate formats are supported:
 *
 * NEW FORMAT (no pdfWidth field):
 *   - Box x/y are absolute PDF points, y measured from the bottom of the page.
 *   - Sub-boxes are relative to their parent box's origin (bottom-left), same units.
 *   - Text nodes (pdfjs) also have y from bottom → direct comparison, no conversion.
 *
 * LEGACY FORMAT (pdfWidth present):
 *   - Box x/y are canvas pixels, y from top.
 *   - Sub-boxes are relative to their parent box.
 *   - Text nodes are converted to canvas pixel space for comparison.
 */
export function mapTextNodesToWorkPlan(
  textNodes: TextNode[],
  config: AreaConfig,
  pageHeight: number,
): WorkPlanEntry {
  const isLegacy = Boolean(config.pdfWidth && config.pageNativeWidth)

  const fieldTexts = new Map<string, string[]>()

  function collect(key: string, str: string) {
    const s = str.trim()
    if (!s) return
    if (!fieldTexts.has(key)) fieldTexts.set(key, [])
    fieldTexts.get(key)!.push(s)
  }

  if (isLegacy) {
    // ── Legacy: canvas-pixel coordinates, y from top, relative sub-boxes ──────
    const scale = config.pdfWidth! / config.pageNativeWidth!
    const canvasH = (config.pageNativeHeight ?? pageHeight) * scale

    for (const node of textNodes) {
      if (node.page !== 1) continue
      const nx = node.x * scale
      const ny = canvasH - node.y * scale   // flip y

      for (const area of config.boxes) {
        if (!contains(nx, ny, area.x, area.y, area.w, area.h)) continue

        if (area.id === "Employee") { collect("employee", node.str); break }
        if (area.id === "Notes") { collect("notes", node.str); break }

        const dayKey = AREA_TO_DAY[area.id]
        if (!dayKey || !area.subBoxes?.length) break

        const relX = nx - area.x
        const relY = ny - area.y
        for (const sub of area.subBoxes) {
          if (!contains(relX, relY, sub.x, sub.y, sub.w, sub.h)) continue
          const field = SUBBOX_TO_FIELD[sub.id]
          if (field) collect(`${dayKey}.${field}`, node.str)
          break
        }
        break
      }
    }
  } else {
    // ── New: absolute PDF-point coordinates, y from bottom ────────────────────
    for (const node of textNodes) {
      if (node.page !== 1) continue

      for (const area of config.boxes) {
        if (!contains(node.x, node.y, area.x, area.y, area.w, area.h)) continue

        if (area.id === "Employee") { collect("employee", node.str); break }
        if (area.id === "Notes") { collect("notes", node.str); break }

        const dayKey = AREA_TO_DAY[area.id]
        if (!dayKey || !area.subBoxes?.length) break

        // Sub-boxes are relative to the parent's origin → offset first
        const relX = node.x - area.x
        const relY = node.y - area.y
        for (const sub of area.subBoxes) {
          if (!contains(relX, relY, sub.x, sub.y, sub.w, sub.h)) continue
          const field = SUBBOX_TO_FIELD[sub.id]
          if (field) collect(`${dayKey}.${field}`, node.str)
          break
        }
        break
      }
    }
  }

  function joined(key: string): string | undefined {
    const parts = fieldTexts.get(key)
    return parts?.length ? parts.join(" ") : undefined
  }

  const result: WorkPlanEntry = {
    employee: joined("employee"),
    schedule: {},
    notes: joined("notes"),
  }

  for (const day of Object.values(AREA_TO_DAY) as DayKey[]) {
    const entry: DayEntry = {
      date: joined(`${day}.date`),
      startTime: joined(`${day}.startTime`),
      endTime: joined(`${day}.endTime`),
      timeSum: joined(`${day}.timeSum`),
      notes: joined(`${day}.notes`),
      notes2: joined(`${day}.notes2`),
    }
    if (Object.values(entry).some((v) => v !== undefined)) {
      result.schedule[day] = entry
    }
  }

  return result
}
