import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// Renders the first page of a PDF File/Blob onto the given canvas element.
export async function renderPdfFirstPage(file, canvas, scale = 1.4) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  try {
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale })
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport }).promise
  } finally {
    pdf.destroy()
  }
}

// Opens a PDF File/Blob for multi-page rendering (used by the signing panel,
// which needs every page visible at once so the signature box can be
// dragged to any of them). Caller is responsible for calling pdf.destroy()
// when done.
export async function loadPdfDocument(file) {
  const arrayBuffer = await file.arrayBuffer()
  return pdfjsLib.getDocument({ data: arrayBuffer }).promise
}

// Renders one page (1-indexed, matching pdf.js convention) of an already-open
// pdf.js document onto the given canvas, returning the rendered {width,
// height} so callers can lay out per-page overlays without re-measuring.
export async function renderPdfPage(pdf, pageNumber, canvas, scale = 1.1) {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  canvas.width = viewport.width
  canvas.height = viewport.height
  const context = canvas.getContext('2d')
  await page.render({ canvasContext: context, viewport }).promise
  return { width: viewport.width, height: viewport.height }
}
