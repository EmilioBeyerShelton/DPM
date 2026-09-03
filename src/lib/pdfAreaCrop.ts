import type { Area, AreaConfig } from "@/types/workPlanTypes"

export interface CropRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

const PADDING_FRACTION = 0.15

/**
 * Computes the source-canvas pixel rect (top-left origin) for an Area, given
 * a page rendered at `sourceCanvas`'s resolution.
 *
 * Handles both AreaConfig coordinate formats (see workPlanMapper.ts):
 *  - legacy: canvas pixels at `config.pdfWidth`, y from top, relative to nothing extra needed here
 *  - new: absolute PDF points, y from the bottom of the page
 * Both are normalized to PDF points with y-from-top, then scaled into the
 * source canvas's actual pixel buffer size.
 */
export function getAreaCropRect(
  area: Area,
  config: AreaConfig,
  nativeWidth: number,
  nativeHeight: number,
  sourceCanvas: HTMLCanvasElement
): CropRect {
  const isLegacy = Boolean(config.pdfWidth && config.pageNativeWidth)

  let xPts: number
  let topPts: number
  let wPts: number
  let hPts: number

  if (isLegacy) {
    const ptsPerLegacyPx = config.pageNativeWidth! / config.pdfWidth!
    xPts = area.x * ptsPerLegacyPx
    topPts = area.y * ptsPerLegacyPx
    wPts = area.w * ptsPerLegacyPx
    hPts = area.h * ptsPerLegacyPx
  } else {
    xPts = area.x
    topPts = nativeHeight - area.y - area.h
    wPts = area.w
    hPts = area.h
  }

  const padX = wPts * PADDING_FRACTION
  const padY = hPts * PADDING_FRACTION
  xPts = Math.max(0, xPts - padX)
  topPts = Math.max(0, topPts - padY)
  wPts = Math.min(nativeWidth - xPts, wPts + padX * 2)
  hPts = Math.min(nativeHeight - topPts, hPts + padY * 2)

  const pxPerPtX = sourceCanvas.width / nativeWidth
  const pxPerPtY = sourceCanvas.height / nativeHeight

  return {
    sx: xPts * pxPerPtX,
    sy: topPts * pxPerPtY,
    sw: wPts * pxPerPtX,
    sh: hPts * pxPerPtY,
  }
}
