import { useEffect, useMemo, useRef, useState } from 'react'
import { invoicesApi } from '../utils/api.js'
import { loadPdfDocument, renderPdfPage } from '../utils/pdf.js'

const PAGE_GAP = 16
const MIN_BOX_WIDTH = 70
const MIN_BOX_HEIGHT = 34

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max))
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function SigningPanel({ invoiceId, invoiceFilename, file, token, onSigned, onBack }) {
  const scrollRef = useRef(null)
  const canvasRefs = useRef([])
  const sigCanvasRef = useRef(null)
  const drawingRef = useRef(false)
  const hasStrokeRef = useRef(false)
  const pdfRef = useRef(null)

  const [numPages, setNumPages] = useState(0)
  const [pageSizes, setPageSizes] = useState([]) // [{width, height}]
  const [previewError, setPreviewError] = useState('')

  const [box, setBox] = useState(null) // {page, xPct, yPct, wPct, hPct}
  const [hasSignature, setHasSignature] = useState(false)
  const [signatureDataUrl, setSignatureDataUrl] = useState(null)
  const [dateValue, setDateValue] = useState(todayIso())
  const [additionalText, setAdditionalText] = useState('')

  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Load the PDF and find out how many pages it has. Rendering happens in a
  // separate effect below, once React has actually mounted a <canvas> for
  // each page — doing it here would race ahead of that DOM update.
  useEffect(() => {
    let cancelled = false
    setNumPages(0)
    setPageSizes([])
    setBox(null)
    setPreviewError('')

    loadPdfDocument(file)
      .then((pdf) => {
        if (cancelled) {
          pdf.destroy()
          return
        }
        pdfRef.current = pdf
        setNumPages(pdf.numPages)
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err.message || 'Could not preview this PDF')
      })

    return () => {
      cancelled = true
      if (pdfRef.current) {
        pdfRef.current.destroy()
        pdfRef.current = null
      }
    }
  }, [file])

  // Once numPages is set, React has rendered one <canvas> per page — now
  // it's safe to render each page's content and measure it.
  useEffect(() => {
    if (!numPages || !pdfRef.current) return undefined
    let cancelled = false

    async function renderAll() {
      const sizes = []
      for (let i = 1; i <= numPages; i += 1) {
        const canvas = canvasRefs.current[i - 1]
        if (!canvas) continue
        // eslint-disable-next-line no-await-in-loop
        const size = await renderPdfPage(pdfRef.current, i, canvas)
        sizes.push(size)
      }
      if (cancelled) return
      setPageSizes(sizes)
      setBox({ page: sizes.length - 1, xPct: 32, yPct: 68, wPct: 34, hPct: 16 })
    }

    renderAll().catch((err) => {
      if (!cancelled) setPreviewError(err.message || 'Could not preview this PDF')
    })

    return () => {
      cancelled = true
    }
  }, [numPages])

  const cumulativeTop = useMemo(() => {
    const offsets = []
    let acc = 0
    for (let i = 0; i < pageSizes.length; i += 1) {
      offsets.push(acc)
      acc += pageSizes[i].height + PAGE_GAP
    }
    return offsets
  }, [pageSizes])

  const totalHeight = pageSizes.length
    ? cumulativeTop[pageSizes.length - 1] + pageSizes[pageSizes.length - 1].height
    : 0
  const maxWidth = pageSizes.length ? Math.max(...pageSizes.map((s) => s.width)) : 0

  const boxPx = useMemo(() => {
    if (!box || !pageSizes[box.page]) return null
    const { width: pw, height: ph } = pageSizes[box.page]
    return {
      left: (box.xPct / 100) * pw,
      top: cumulativeTop[box.page] + (box.yPct / 100) * ph,
      width: (box.wPct / 100) * pw,
      height: (box.hPct / 100) * ph,
    }
  }, [box, pageSizes, cumulativeTop])

  function pxToBox(leftPx, topPx, widthPx, heightPx) {
    const centerY = topPx + heightPx / 2
    let pageIdx = 0
    for (let i = 0; i < pageSizes.length; i += 1) {
      if (centerY >= cumulativeTop[i]) pageIdx = i
    }
    const { width: pw, height: ph } = pageSizes[pageIdx]
    const wPct = clamp((widthPx / pw) * 100, 0, 100)
    const hPct = clamp((heightPx / ph) * 100, 0, 100)
    const xPct = clamp((leftPx / pw) * 100, 0, 100 - wPct)
    const yPct = clamp(((topPx - cumulativeTop[pageIdx]) / ph) * 100, 0, 100 - hPct)
    return { page: pageIdx, xPct, yPct, wPct, hPct }
  }

  const startDragBox = (e) => {
    if (!boxPx) return
    e.preventDefault()
    e.stopPropagation()
    const startClientX = e.clientX
    const startClientY = e.clientY
    const start = { ...boxPx }

    const onMove = (ev) => {
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      const newLeft = clamp(start.left + dx, 0, Math.max(0, maxWidth - start.width))
      const newTop = clamp(start.top + dy, 0, Math.max(0, totalHeight - start.height))
      setBox(pxToBox(newLeft, newTop, start.width, start.height))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startResize = (e) => {
    if (!boxPx || !box) return
    e.preventDefault()
    e.stopPropagation()
    const startClientX = e.clientX
    const startClientY = e.clientY
    const start = { ...boxPx }
    const pageIdx = box.page
    const { width: pw, height: ph } = pageSizes[pageIdx]
    const pageTop = cumulativeTop[pageIdx]

    const onMove = (ev) => {
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      const maxW = pw - start.left
      const maxH = ph - (start.top - pageTop)
      const newWidth = clamp(start.width + dx, MIN_BOX_WIDTH, Math.max(MIN_BOX_WIDTH, maxW))
      const newHeight = clamp(start.height + dy, MIN_BOX_HEIGHT, Math.max(MIN_BOX_HEIGHT, maxH))
      setBox({
        page: pageIdx,
        xPct: (start.left / pw) * 100,
        yPct: ((start.top - pageTop) / ph) * 100,
        wPct: (newWidth / pw) * 100,
        hPct: (newHeight / ph) * 100,
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Signature pad — Pointer Events unify mouse and touch input.
  const getSigPoint = (e) => {
    const rect = sigCanvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDraw = (e) => {
    e.preventDefault()
    const canvas = sigCanvasRef.current
    canvas.setPointerCapture(e.pointerId)
    const ctx = canvas.getContext('2d')
    const { x, y } = getSigPoint(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    drawingRef.current = true
  }

  const draw = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = sigCanvasRef.current.getContext('2d')
    const { x, y } = getSigPoint(e)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineTo(x, y)
    ctx.stroke()
    hasStrokeRef.current = true
  }

  const endDraw = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (hasStrokeRef.current) {
      setHasSignature(true)
      setSignatureDataUrl(sigCanvasRef.current.toDataURL('image/png'))
    }
  }

  const clearSignature = () => {
    const canvas = sigCanvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    hasStrokeRef.current = false
    setHasSignature(false)
    setSignatureDataUrl(null)
  }

  const handlePlace = async () => {
    setPlaceError('')
    if (!hasSignature || !signatureDataUrl) {
      setPlaceError('Please draw your signature in the box below first')
      return
    }
    if (!dateValue) {
      setPlaceError('Please choose a date')
      return
    }
    if (!box) return

    setPlacing(true)
    try {
      await invoicesApi.sign(
        invoiceId,
        {
          signature_image: signatureDataUrl,
          date: dateValue,
          page: box.page + 1,
          x: box.xPct,
          y: box.yPct,
          width: box.wPct,
          height: box.hPct,
          additional_text: additionalText.trim() || null,
        },
        token
      )
      const blob = await invoicesApi.downloadSignedPdf(invoiceId, token)
      downloadBlob(blob, `signed_${invoiceFilename}`)
      setSuccessMessage('Signature applied — the signed PDF has been downloaded. Confirming…')
      window.setTimeout(() => {
        onSigned()
      }, 1100)
    } catch (err) {
      setPlaceError(err.message || 'Failed to place signature')
      setPlacing(false)
    }
  }

  return (
    <div className="kt-sign-body">
      <div className="kt-sign-preview" ref={scrollRef}>
        {previewError ? (
          <div className="kt-review-preview-error">{previewError}</div>
        ) : (
          <div className="kt-sign-pages" style={{ width: maxWidth || undefined }}>
            {Array.from({ length: numPages }).map((_, i) => (
              <div
                key={i}
                className="kt-sign-page"
                style={{ marginBottom: i === numPages - 1 ? 0 : PAGE_GAP }}
              >
                <canvas ref={(el) => (canvasRefs.current[i] = el)} className="kt-sign-canvas" />
                <span className="kt-sign-page-label">
                  Page {i + 1} of {numPages}
                </span>
              </div>
            ))}

            {boxPx && (
              <div
                className="kt-sign-box"
                style={{ left: boxPx.left, top: boxPx.top, width: boxPx.width, height: boxPx.height }}
                onPointerDown={startDragBox}
              >
                <div className="kt-sign-box-content">
                  {signatureDataUrl ? (
                    <img src={signatureDataUrl} alt="Your signature" className="kt-sign-box-image" />
                  ) : (
                    <span className="kt-sign-box-placeholder">Signature</span>
                  )}
                  <span className="kt-sign-box-date">{dateValue}</span>
                </div>
                <div
                  className="kt-sign-box-handle"
                  onPointerDown={startResize}
                  title="Drag to resize"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="kt-sign-controls">
        <p className="kt-sign-instructions">
          Drag the signature box to a blank area of the document. Use the handle in its
          bottom-right corner to resize it — it can be placed on any page.
        </p>

        <div className="kt-field">
          <label>Your signature</label>
          <canvas
            ref={sigCanvasRef}
            width={420}
            height={150}
            className="kt-sign-pad"
            onPointerDown={startDraw}
            onPointerMove={draw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
          />
          <button type="button" className="kt-category-link-button" onClick={clearSignature}>
            Clear signature
          </button>
        </div>

        <div className="kt-field">
          <label htmlFor="sign-date">Date</label>
          <input
            id="sign-date"
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            required
          />
        </div>

        <div className="kt-field">
          <label htmlFor="sign-additional-text">Additional text (optional)</label>
          <input
            id="sign-additional-text"
            type="text"
            value={additionalText}
            onChange={(e) => setAdditionalText(e.target.value)}
            placeholder="e.g. your name, a note, or reference number"
            maxLength={500}
          />
        </div>

        {placeError && <div className="kt-auth-error">{placeError}</div>}
        {successMessage && <div className="kt-sign-success">{successMessage}</div>}

        <div className="kt-review-actions">
          <button
            type="button"
            className="kt-auth-button"
            onClick={handlePlace}
            disabled={placing || Boolean(successMessage)}
          >
            {placing ? 'Placing signature…' : 'Place signature'}
          </button>
          <button
            type="button"
            className="kt-review-discard-button"
            onClick={onBack}
            disabled={placing || Boolean(successMessage)}
          >
            ← Back to details
          </button>
        </div>
      </div>
    </div>
  )
}
