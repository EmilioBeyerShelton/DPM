import { useState } from "react"
import { pdfjs } from "react-pdf"
import type { TextItem } from "pdfjs-dist/types/src/display/api"
import PdfThumbnail from "@/components/PdfThumbnail"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString()

interface TextNode {
  page: number
  str: string
  x: number
  y: number
  width: number
  height: number
}

export default function WorkPlanManager() {
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [textNodes, setTextNodes] = useState<TextNode[]>([])
  const [isExtracting, setIsExtracting] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || file.type !== "application/pdf") return

    setPdfFile(file)
    setTextNodes([])
    setIsExtracting(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise
      const nodes: TextNode[] = []

      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum)
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

      setTextNodes(nodes.sort((a, b) => b.y - a.y))
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="pdf-upload">
          Upload PDF Timetable
        </label>
        <input
          id="pdf-upload"
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          className="w-fit cursor-pointer text-sm"
        />
      </div>

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

      {textNodes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Extracted Text Nodes ({textNodes.length})
          </p>
          <div className="overflow-auto rounded border">
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
        </div>
      )}
    </div>
  )
}
