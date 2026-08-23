import { useState } from "react"
import { pdfjs } from "react-pdf"
import type { TextItem } from "pdfjs-dist/types/src/display/api"
import PdfThumbnail from "@/components/PdfThumbnail"
import defaultAreas from "@/config/defaultAreas"
import { mapTextNodesToWorkPlan } from "@/lib/workPlanMapper"
import type { AreaConfig, WorkPlanEntry } from "@/types/workPlanTypes"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

interface TextNode {
  page: number
  str: string
  x: number
  y: number
  width: number
  height: number
}

const DAY_LABELS: Array<{
  key: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
  label: string
}> = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
]

export default function WorkPlanManager() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [textNodes, setTextNodes] = useState<TextNode[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [areaConfig, setAreaConfig] = useState<AreaConfig>(defaultAreas)
  const [mappedEntry, setMappedEntry] = useState<WorkPlanEntry | null>(null)
  const [pageHeight, setPageHeight] = useState(0)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || file.type !== "application/pdf") return

    setPdfFile(file)
    setTextNodes([])
    setMappedEntry(null)
    setIsExtracting(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
      const nodes: TextNode[] = []
      let ph = 0

      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum)

        if (pageNum === 1) {
          ph = page.getViewport({ scale: 1 }).height
          setPageHeight(ph)
        }

        const content = await page.getTextContent()
        for (const item of content.items) {
          const textItem = item as TextItem
          if (!("str" in textItem) || !textItem.str.trim()) continue
          nodes.push({
            page: pageNum,
            str: textItem.str,
            x: Math.round(textItem.transform[4]),
            y: Math.round(textItem.transform[5]),
            width: Math.round(textItem.width),
            height: Math.round(textItem.height),
          })
        }
      }

      const sorted = nodes.sort((a, b) => b.y - a.y)
      setTextNodes(sorted)
      setMappedEntry(mapTextNodesToWorkPlan(sorted, areaConfig, ph))
    } finally {
      setIsExtracting(false)
    }
  }

  function handleAreasUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        // Accept either a plain Area[] array (new format from reworked editor)
        // or an AreaConfig object (with optional pdfWidth metadata)
        const config: AreaConfig = Array.isArray(parsed)
          ? { boxes: parsed }
          : parsed
        setAreaConfig(config)
        // Re-run mapper if we already have text nodes
        if (textNodes.length > 0 && pageHeight > 0) {
          setMappedEntry(mapTextNodesToWorkPlan(textNodes, config, pageHeight))
        }
      } catch {
        alert("Invalid JSON file.")
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  return (
    <div className="flex min-h-svh flex-col gap-8 p-6">
      {/* ── file inputs ──────────────────────────────────────────────── */}

      <div className="flex flex-wrap gap-6">
        <Field>
          <FieldLabel htmlFor="pdf-upload">Upload PDF Timetable</FieldLabel>
          <Input
            id="pdf-upload"
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="w-fit cursor-pointer"
          />
          <FieldDescription>Upload PDF Timetable</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="areas-upload">
            Area Configuration (JSON)
          </FieldLabel>
          <Input
            id="areas-upload"
            type="file"
            accept="application/json"
            onChange={handleAreasUpload}
            className="w-fit cursor-pointer text-sm"
          />
          <FieldDescription>
            {areaConfig === defaultAreas
              ? "Using built-in default — upload a JSON from BoundingBoxEditor to override"
              : "Custom configuration loaded"}
          </FieldDescription>
        </Field>
      </div>

      {/* ── PDF preview ──────────────────────────────────────────────── */}
      {pdfFile && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Preview</p>
          <div className="w-fit overflow-hidden rounded border shadow-sm">
            <PdfThumbnail file={pdfFile} width={220} />
          </div>
          <p className="text-xs text-gray-500">{pdfFile.name}</p>
        </div>
      )}

      {isExtracting && (
        <p className="text-sm text-gray-500">Extracting text…</p>
      )}

      {/* ── Mapped work plan ─────────────────────────────────────────── */}
      {mappedEntry && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">Mapped Work Plan</h2>

          {/* <div className="flex flex-wrap gap-4 text-sm">
            <div className="rounded border px-3 py-2">
              <span className="font-medium text-gray-500">Employee: </span>
              <span>{mappedEntry.employee ?? "—"}</span>
            </div>
            {mappedEntry.notes && (
              <div className="rounded border px-3 py-2">
                <span className="font-medium text-gray-500">Notes: </span>
                <span>{mappedEntry.notes}</span>
              </div>
            )}
          </div> */}

          <div className="overflow-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 font-medium">Day</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Start</th>
                  <th className="px-3 py-2 font-medium">End</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {DAY_LABELS.map(({ key, label }) => {
                  const day = mappedEntry.schedule[key]
                  return (
                    <tr
                      key={key}
                      className="border-t odd:bg-white even:bg-gray-50"
                    >
                      <td className="px-3 py-1.5 font-medium">{label}</td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {day?.date ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {day?.startTime ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {day?.endTime ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {day?.timeSum ?? "—"}
                      </td>
                      <td className="max-w-xs px-3 py-1.5">
                        {day?.notes ?? "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div>cards</div>
        </div>
      )}

      {/* ── Raw text nodes ───────────────────────────────────────────── */}
      {textNodes.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer text-sm font-medium text-gray-500">
            Raw Text Nodes ({textNodes.length})
          </summary>
          <div className="mt-2 overflow-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 font-medium">Page</th>
                  <th className="px-3 py-2 font-medium">Text</th>
                  <th className="px-3 py-2 font-medium">X</th>
                  <th className="px-3 py-2 font-medium">Y</th>
                  <th className="px-3 py-2 font-medium">W</th>
                  <th className="px-3 py-2 font-medium">H</th>
                </tr>
              </thead>
              <tbody>
                {textNodes.map((node, i) => (
                  <tr key={i} className="border-t odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-1 tabular-nums">{node.page}</td>
                    <td className="max-w-xs truncate px-3 py-1 font-mono">
                      {node.str}
                    </td>
                    <td className="px-3 py-1 tabular-nums">{node.x}</td>
                    <td className="px-3 py-1 tabular-nums">{node.y}</td>
                    <td className="px-3 py-1 tabular-nums">{node.width}</td>
                    <td className="px-3 py-1 tabular-nums">{node.height}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
