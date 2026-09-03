export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

export interface DayLabel {
  key: DayKey
  label: string
  /** Matching `Area.id` in AreaConfig (see workPlanMapper's AREA_TO_DAY) */
  areaId: string
}

export const DAY_LABELS: DayLabel[] = [
  { key: "mon", label: "Mo", areaId: "Mon" },
  { key: "tue", label: "Di", areaId: "Tue" },
  { key: "wed", label: "Mi", areaId: "Wed" },
  { key: "thu", label: "Do", areaId: "Thu" },
  { key: "fri", label: "Fr", areaId: "Fri" },
  { key: "sat", label: "Sa", areaId: "Sat" },
  { key: "sun", label: "So", areaId: "Sun" },
]
