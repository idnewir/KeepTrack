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
// pdf.js document onto the given canvas, scaled to fill `targetWidth` CSS
// pixels while preserving aspect ratio, returning the rendered {width,
// height} *in CSS pixels* so callers can lay out per-page overlays without
// re-measuring, plus the pdf.js `renderTask` itself so the caller can track
// and cancel it.
//
// The canvas's backing-store resolution (its width/height attributes) is set
// to targetWidth * devicePixelRatio for crisp rendering on high-DPI screens,
// but canvas.style.width/height are pinned to the CSS-pixel viewport size —
// this is what the caller's pointer/percentage math must be based on. Any
// mismatch between the two (e.g. relying on a CSS `max-width: 100%` rule to
// shrink the canvas instead of rendering it at the right size to begin with)
// is what previously made the draggable signature box drift out of sync
// with the visually displayed PDF.
//
// This function deliberately does NOT await the render to completion — it
// returns as soon as `page.render()` has started, handing back the
// `renderTask` so the caller can store it *before* the pixels are actually
// painted. pdf.js throws "Cannot use the same canvas during multiple
// render() operations" if a second render is started on the same canvas
// before the first is cancelled or finished, so callers must track the
// previous renderTask per canvas and call `.cancel()` on it before invoking
// this function again for that canvas.
export async function renderPdfPage(pdf, pageNumber, canvas, targetWidth) {
  const page = await pdf.getPage(pageNumber)
  const baseWidth = page.getViewport({ scale: 1 }).width
  const scale = targetWidth ? targetWidth / baseWidth : 1.1
  const viewport = page.getViewport({ scale })

  const outputScale = window.devicePixelRatio || 1
  const cssWidth = Math.round(viewport.width)
  const cssHeight = Math.round(viewport.height)
  canvas.width = Math.round(cssWidth * outputScale)
  canvas.height = Math.round(cssHeight * outputScale)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`

  const context = canvas.getContext('2d')
  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
  const renderTask = page.render({ canvasContext: context, viewport, transform })
  return { width: cssWidth, height: cssHeight, renderTask }
}
