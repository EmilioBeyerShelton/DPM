import { Document, Page, pdfjs } from "react-pdf"

// required worker setup
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

export default function PdfThumbnail(file: File, size = 150) {
  return (
    <Document file={file}>
      <Page pageNumber={1} width={size} />
    </Document>
  )
}
