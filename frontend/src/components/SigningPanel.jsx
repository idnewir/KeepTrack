import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { invoicesApi, profileApi } from '../utils/api.js'
import { loadPdfDocument, renderPdfPage } from '../utils/pdf.js'

const PAGE_GAP = 16
const MIN_BOX_WIDTH = 60
const MIN_BOX_HEIGHT = 32
const RESIZE_DEBOUNCE_MS = 120
const TRANSITION_MS = 220
const CORNERS = ['nw', 'ne', 'sw', 'se']

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

export default function SigningPanel({ invoiceId, invoiceFilename, file, token, user, onSigned, onBack }) {
  const scrollRef = useRef(null)
  const canvasRefs = useRef([])
  const sigCanvasRef = useRef(null)
  const drawingRef = useRef(false)
  const hasStrokeRef = useRef(false)
  const pdfRef = useRef(null)
  const resizeTimerRef = useRef(null)
  // One pdf.js RenderTask (or null) per page index, so a render that's still
  // in flight can always be cancelled before a new one starts on the same
  // canvas — see the RenderingCancelledException handling below and
  // utils/pdf.js's renderPdfPage doc comment.
  const renderTasksRef = useRef([])
  // Bumped every time a new PDF is loaded; folded into each page canvas's
  // React `key` so a new document always gets brand-new <canvas> DOM nodes
  // rather than reusing (and potentially still-rendering-into) the previous
  // document's canvases.
  const docIdRef = useRef(0)

  // Enter/exit transition — `visible` drives the CSS class that fades/scales
  // the overlay in on mount; `closing` reverses it, and the real onBack/
  // onSigned callback fires only after the transition has actually finished.
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  const [numPages, setNumPages] = useState(0)
  const [pageSizes, setPageSizes] = useState([]) // [{width, height}] in CSS px
  const [previewError, setPreviewError] = useState('')
  const [containerWidth, setContainerWidth] = useState(0)
  const [docId, setDocId] = useState(0)

  const [box, setBox] = useState(null) // {page, xPct, yPct, wPct, hPct}
  const [hasSignature, setHasSignature] = useState(false)
  const [signatureDataUrl, setSignatureDataUrl] = useState(null)
  const [dateValue, setDateValue] = useState(todayIso())
  const [additionalText, setAdditionalText] = useState('')

  // Signature source — defaults to the user's saved signature when they
  // have one, since that's the faster path; "Draw signature" switches back
  // to the canvas below. See docs/decisions-log.md.
  const hasSavedSignature = Boolean(user?.has_signature)
  const [signatureMode, setSignatureMode] = useState(hasSavedSignature ? 'saved' : 'draw')
  const [savedSignatureDataUrl, setSavedSignatureDataUrl] = useState(null)
  const [loadingSavedSignature, setLoadingSavedSignature] = useState(false)
  const usingSaved = signatureMode === 'saved' && hasSavedSignature
  const effectiveSignatureDataUrl = usingSaved ? savedSignatureDataUrl : signatureDataUrl
  const effectiveHasSignature = usingSaved ? Boolean(savedSignatureDataUrl) : hasSignature

  useEffect(() => {
    if (!hasSavedSignature) return undefined
    let cancelled = false
    setLoadingSavedSignature(true)
    profileApi
      .getSignatureBlob(user.id, token)
      .then(
        (blob) =>
          new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.readAsDataURL(blob)
          })
      )
      .then((dataUrl) => {
        if (!cancelled) setSavedSignatureDataUrl(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setSavedSignatureDataUrl(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingSavedSignature(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSavedSignature, user?.id, token])

  const [viewPage, setViewPage] = useState(0) // 0-indexed page currently scrolled into view
  const [drawerOpen, setDrawerOpen] = useState(true) // mobile bottom-drawer expanded state

  const [placing, setPlacing] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Mount transition + lock the page behind the overlay from scrolling.
  useEffect(() => {
    document.body.classList.add('kt-sign-lock-scroll')
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => {
      document.body.classList.remove('kt-sign-lock-scroll')
      cancelAnimationFrame(raf)
    }
  }, [])

  const requestClose = useCallback((after) => {
    setClosing(true)
    window.setTimeout(after, TRANSITION_MS)
  }, [])

  // Cancels every render still in flight (used on unmount, when the PDF
  // changes, and before a fresh render pass starts) so no stale render can
  // ever land on a canvas after the fact — pdf.js's own guard against two
  // concurrent renders on one canvas is what throws the "Cannot use the same
  // canvas during multiple render() operations" error this is fixing.
  const cancelAllRenderTasks = useCallback(() => {
    renderTasksRef.current.forEach((task) => {
      if (task) task.cancel()
    })
    renderTasksRef.current = []
  }, [])

  // Track the width actually available for the PDF (the area beside/above
  // the toolbar), so pages can be rendered at exactly that width instead of
  // being rendered at a fixed resolution and then CSS-shrunk to fit — that
  // mismatch between "pixels the PDF was rendered at" and "pixels it's
  // displayed at" was what threw off the drag/percentage math previously.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    const measure = () => {
      const width = Math.max(200, Math.floor(el.clientWidth) - 24)
      setContainerWidth((prev) => (Math.abs(prev - width) > 4 ? width : prev))
    }
    measure()
    const observer = new ResizeObserver(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = window.setTimeout(measure, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    }
  }, [])

  // Load the PDF and find out how many pages it has. Rendering happens in a
  // separate effect below, once React has actually mounted a <canvas> for
  // each page — doing it here would race ahead of that DOM update.
  useEffect(() => {
    let cancelled = false

    // A fresh document means every previous canvas is about to be torn down
    // (see the `docId`-keyed canvases below) — cancel whatever was still
    // rendering into them first, and destroy the previous pdf.js document
    // instance rather than leaving it (and any in-flight worker requests) to
    // outlive the panel switching to a new file.
    cancelAllRenderTasks()
    if (pdfRef.current) {
      pdfRef.current.destroy()
      pdfRef.current = null
    }
    canvasRefs.current = []
    docIdRef.current += 1
    setDocId(docIdRef.current)
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
      cancelAllRenderTasks()
      if (pdfRef.current) {
        pdfRef.current.destroy()
        pdfRef.current = null
      }
    }
  }, [file, cancelAllRenderTasks])

  // Renders every page at the current container width — re-runs whenever
  // the page count first becomes known, or the available width changes
  // (e.g. the browser is resized, or the mobile drawer opens/closes).
  useEffect(() => {
    if (!numPages || !pdfRef.current || !containerWidth) return undefined
    let cancelled = false
    const pdf = pdfRef.current

    async function renderAll() {
      const sizes = []
      for (let i = 1; i <= numPages; i += 1) {
        // Checked on every iteration (not just after the loop) so a stale
        // pass — e.g. superseded by a resize that changed containerWidth
        // again while this one was still running — stops immediately
        // instead of continuing to render pages nobody wants anymore.
        if (cancelled) return
        const canvas = canvasRefs.current[i - 1]
        if (!canvas) continue

        // Cancel whatever was previously rendering into this exact canvas
        // before starting a new render on it — required even though each
        // new *document* gets fresh canvases (via the docId key below),
        // because a resize can trigger a second render pass over the same
        // document's same canvases while the first pass is still running.
        const prevTask = renderTasksRef.current[i - 1]
        if (prevTask) prevTask.cancel()

        // eslint-disable-next-line no-await-in-loop
        const { width, height, renderTask } = await renderPdfPage(pdf, i, canvas, containerWidth)
        renderTasksRef.current[i - 1] = renderTask
        try {
          // eslint-disable-next-line no-await-in-loop
          await renderTask.promise
        } catch (err) {
          if (err?.name === 'RenderingCancelledException') return
          throw err
        } finally {
          if (renderTasksRef.current[i - 1] === renderTask) renderTasksRef.current[i - 1] = null
        }
        if (cancelled) return
        sizes.push({ width, height })
      }
      if (cancelled) return
      setPageSizes(sizes)
      // Keep an existing box's (resolution-independent) percentages as-is on
      // re-render; only pick a default the first time a box doesn't exist yet.
      setBox((prev) => prev || { page: sizes.length - 1, xPct: 30, yPct: 68, wPct: 36, hPct: 16 })
    }

    renderAll().catch((err) => {
      if (!cancelled) setPreviewError(err.message || 'Could not preview this PDF')
    })

    return () => {
      cancelled = true
      renderTasksRef.current.forEach((task) => {
        if (task) task.cancel()
      })
    }
  }, [numPages, containerWidth, docId])

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

  // Keeps the "Page X of Y" indicator and the page selector in sync with
  // whatever page is actually scrolled into view.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pageSizes.length) return undefined
    const onScroll = () => {
      const top = el.scrollTop + 4
      let idx = 0
      for (let i = 0; i < cumulativeTop.length; i += 1) {
        if (top >= cumulativeTop[i]) idx = i
      }
      setViewPage(idx)
    }
    el.addEventListener('scroll', onScroll)
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [pageSizes, cumulativeTop])

  const goToPage = (idx) => {
    const el = scrollRef.current
    if (!el || cumulativeTop[idx] === undefined) return
    el.scrollTo({ top: cumulativeTop[idx], behavior: 'smooth' })
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

  // One generic handler for all four corner handles — `corner` (e.g. "se")
  // says which edges move; the opposite corner stays fixed.
  const startResize = (corner) => (e) => {
    if (!boxPx || !box) return
    e.preventDefault()
    e.stopPropagation()
    const startClientX = e.clientX
    const startClientY = e.clientY
    const pageIdx = box.page
    const { width: pw, height: ph } = pageSizes[pageIdx]
    const pageTop = cumulativeTop[pageIdx]

    const startLeft = boxPx.left
    const startTop = boxPx.top - pageTop
    const startRight = startLeft + boxPx.width
    const startBottom = startTop + boxPx.height

    const onMove = (ev) => {
      const dx = ev.clientX - startClientX
      const dy = ev.clientY - startClientY
      let left = startLeft
      let top = startTop
      let right = startRight
      let bottom = startBottom

      if (corner.includes('w')) left = clamp(startLeft + dx, 0, right - MIN_BOX_WIDTH)
      if (corner.includes('e')) right = clamp(startRight + dx, left + MIN_BOX_WIDTH, pw)
      if (corner.includes('n')) top = clamp(startTop + dy, 0, bottom - MIN_BOX_HEIGHT)
      if (corner.includes('s')) bottom = clamp(startBottom + dy, top + MIN_BOX_HEIGHT, ph)

      setBox({
        page: pageIdx,
        xPct: (left / pw) * 100,
        yPct: (top / ph) * 100,
        wPct: ((right - left) / pw) * 100,
        hPct: ((bottom - top) / ph) * 100,
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
    if (!effectiveHasSignature || !effectiveSignatureDataUrl) {
      setPlaceError(
        usingSaved
          ? 'Your saved signature could not be loaded'
          : 'Please draw your signature in the box below first'
      )
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
          signature_image: effectiveSignatureDataUrl,
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
      setSuccessMessage('Signature applied — the signed PDF has been downloaded.')
      window.setTimeout(() => requestClose(onSigned), 900)
    } catch (err) {
      setPlaceError(err.message || 'Failed to place signature')
      setPlacing(false)
    }
  }

  const handleCancel = () => requestClose(onBack)

  return createPortal(
    <div className={`kt-sign-overlay${visible && !closing ? ' kt-sign-visible' : ''}`}>
      <div className="kt-sign-pdfarea">
        <div className="kt-sign-page-indicator">
          Page {numPages ? Math.min(viewPage + 1, numPages) : 1} of {numPages || 1}
        </div>

        {previewError ? (
          <div className="kt-sign-preview-error">{previewError}</div>
        ) : (
          <div className="kt-sign-scroll" ref={scrollRef}>
            <div className="kt-sign-pages" style={{ width: maxWidth || undefined }}>
              {Array.from({ length: numPages }).map((_, i) => (
                <div
                  key={`${docId}-${i}`}
                  className="kt-sign-page"
                  style={{ marginBottom: i === numPages - 1 ? 0 : PAGE_GAP }}
                >
                  <canvas ref={(el) => (canvasRefs.current[i] = el)} className="kt-sign-canvas" />
                </div>
              ))}

              {boxPx && (
                <div
                  className="kt-sign-box"
                  style={{ left: boxPx.left, top: boxPx.top, width: boxPx.width, height: boxPx.height }}
                  onPointerDown={startDragBox}
                >
                  <div className="kt-sign-box-content">
                    {effectiveSignatureDataUrl ? (
                      <img src={effectiveSignatureDataUrl} alt="Your signature" className="kt-sign-box-image" />
                    ) : (
                      <span className="kt-sign-box-placeholder">Signature</span>
                    )}
                    <span className="kt-sign-box-date">{dateValue}</span>
                  </div>
                  {CORNERS.map((corner) => (
                    <div
                      key={corner}
                      className={`kt-sign-box-handle kt-sign-box-handle-${corner}`}
                      onPointerDown={startResize(corner)}
                      title="Drag to resize"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={`kt-sign-toolbar${drawerOpen ? '' : ' kt-sign-toolbar-collapsed'}`}>
        <button
          type="button"
          className="kt-sign-toolbar-tab"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <span>Signature tools</span>
          <span className="kt-sign-toolbar-tab-chevron" aria-hidden="true">
            {drawerOpen ? '⌄' : '⌃'}
          </span>
        </button>

        <div className="kt-sign-toolbar-content">
          <div className="kt-field">
            <label>Your signature</label>

            {hasSavedSignature && (
              <div className="kt-sign-source-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={usingSaved}
                  className={`kt-sign-source-tab${usingSaved ? ' active' : ''}`}
                  onClick={() => setSignatureMode('saved')}
                >
                  Use saved signature
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!usingSaved}
                  className={`kt-sign-source-tab${!usingSaved ? ' active' : ''}`}
                  onClick={() => setSignatureMode('draw')}
                >
                  Draw signature
                </button>
              </div>
            )}

            {usingSaved ? (
              <div className="kt-sign-saved-preview">
                {loadingSavedSignature ? (
                  <span className="kt-field-note">Loading your saved signature…</span>
                ) : savedSignatureDataUrl ? (
                  <img src={savedSignatureDataUrl} alt="Your saved signature" />
                ) : (
                  <span className="kt-field-note">Could not load your saved signature.</span>
                )}
              </div>
            ) : (
              <>
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
              </>
            )}

            {!hasSavedSignature && (
              <span className="kt-field-note">
                Save a signature in your <Link to="/profile">profile</Link> for faster signing.
              </span>
            )}

            <span className="kt-field-note">
              Your name ({user?.display_name || user?.username}) will be added below your signature
              automatically.
            </span>
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

          {numPages > 1 && (
            <div className="kt-field">
              <label htmlFor="sign-page-select">Place on page:</label>
              <select
                id="sign-page-select"
                value={viewPage}
                onChange={(e) => goToPage(Number(e.target.value))}
              >
                {Array.from({ length: numPages }).map((_, i) => (
                  <option key={i} value={i}>
                    Page {i + 1}
                  </option>
                ))}
              </select>
            </div>
          )}

          {placeError && <div className="kt-auth-error">{placeError}</div>}
          {successMessage && <div className="kt-sign-success">{successMessage}</div>}

          <div className="kt-sign-toolbar-actions">
            <button
              type="button"
              className="kt-auth-button kt-sign-place-button"
              onClick={handlePlace}
              disabled={placing || Boolean(successMessage)}
            >
              {placing ? 'Placing signature…' : 'Place signature'}
            </button>
            <button
              type="button"
              className="kt-sign-cancel-button"
              onClick={handleCancel}
              disabled={placing || Boolean(successMessage)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
