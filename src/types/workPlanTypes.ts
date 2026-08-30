export interface DayEntry {
  date?: string
  startTime?: string
  endTime?: string
  timeSum?: string
  notes?: string
  notes2?: string
}

export interface ShiftDTO {
  date?: Date
  startTime?: Date
  endTime?: Date
  timeSum?: number
  /** ICS event title (VEVENT SUMMARY). */
  title?: string
  /** ICS event description (VEVENT DESCRIPTION). */
  notes?: string
  notes2?: string
}

export interface WorkPlanEntry {
  employee?: string
  schedule: Partial<
    Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayEntry>
  >
  notes?: string
}

export interface SubArea {
  id: string
  /** X offset relative to the parent area's origin */
  x: number
  /**
   * Y offset relative to the parent area's origin, in the same
   * up/down convention as the parent (y from top for legacy canvas-pixel
   * configs, y from bottom for PDF-point configs).
   */
  y: number
  w: number
  h: number
}

export interface Area {
  id: string
  /** X position in PDF points from left */
  x: number
  /** Y position in PDF points from top of page */
  y: number
  w: number
  h: number
  subBoxes?: SubArea[]
}

export interface AreaConfig {
  /**
   * Present when coordinates are canvas pixels from BoundingBoxEditor.
   * Contains the CSS render width used when boxes were drawn.
   * If absent, x/y/w/h are already in PDF points.
   */
  pdfWidth?: number
  /** PDF page native width in points (required when pdfWidth is present) */
  pageNativeWidth?: number
  /** PDF page native height in points (required when pdfWidth is present) */
  pageNativeHeight?: number
  boxes: Area[]
}
