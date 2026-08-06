import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { importsApi, triggerBlobDownload } from '../../utils/api.js'

const MAPPING_FIELDS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'supplier', label: 'Supplier', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'category', label: 'Category', required: false },
  { key: 'notes', label: 'Notes', required: false },
  { key: 'duplicate_flag', label: 'Duplicate flag', required: false },
  { key: 'filename', label: 'Filename', required: false },
]

const TEMPLATE_CONTENT = [
  '# Keep Track historical invoice import template. Date accepts DD/MM/YYYY, YYYY-MM-DD, or MM/YYYY. Delete the example rows below and add your own — one invoice per row.',
  'Date,Supplier,Amount (£),Category,Notes',
  '15/09/2024,British Gas,145.32,Electricity,',
  '2024-10-03,Thames Water,88.00,Water,',
  '11/2024,ADT Alarms,60.00,Alarm,Monthly monitoring fee',
].join('\r\n')

function isCsv(file) {
  return file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
}

function mappingFromColumnMap(columnMap) {
  const mapping = {}
  MAPPING_FIELDS.forEach((f) => {
    const idx = columnMap[f.key]
    mapping[f.key] = idx === undefined || idx === null ? '' : String(idx)
  })
  return mapping
}

export default function CsvImportTab({ token, onImported }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [mapping, setMapping] = useState({})
  const [previewError, setPreviewError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [importError, setImportError] = useState('')
  const [result, setResult] = useState(null)
  const [showSkipped, setShowSkipped] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)

  const fileInputRef = useRef(null)

  const loadFile = async (candidate) => {
    if (!candidate || !isCsv(candidate)) return
    setResult(null)
    setImportError('')
    setPreviewError('')
    setPreviewLoading(true)
    setFile(candidate)
    try {
      const res = await importsApi.previewCsv(candidate, token)
      setPreview(res)
      setMapping(mappingFromColumnMap(res.column_map))
    } catch (err) {
      setPreviewError(err.message || 'Could not read this CSV file')
      setFile(null)
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    loadFile(e.dataTransfer.files[0])
  }

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CONTENT], { type: 'text/csv;charset=utf-8' })
    triggerBlobDownload(blob, 'keep-track-invoice-import-template.csv')
  }

  const handleReset = () => {
    setFile(null)
    setPreview(null)
    setMapping({})
    setPreviewError('')
  }

  const requiredMapped = MAPPING_FIELDS.filter((f) => f.required).every((f) => mapping[f.key] !== '' && mapping[f.key] !== undefined)

  const handleImport = async () => {
    if (!file || !requiredMapped) return
    setImportError('')
    setImporting(true)
    setProgress(0)
    try {
      const columnMapPayload = {}
      MAPPING_FIELDS.forEach((f) => {
        if (mapping[f.key] !== '' && mapping[f.key] !== undefined) {
          columnMapPayload[f.key] = Number(mapping[f.key])
        }
      })
      const res = await importsApi.uploadCsv(file, columnMapPayload, token, setProgress)
      setResult(res)
      handleReset()
      onImported?.()
    } catch (err) {
      setImportError(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="kt-import-tab">
      <p className="kt-page-subtitle">
        Import historical invoice data from a spreadsheet. Invoices imported this way are marked as
        historical and do not require signing or review.
      </p>

      <div className="kt-import-actions-row">
        <button type="button" className="kt-category-link-button" onClick={handleDownloadTemplate}>
          Download CSV template
        </button>
      </div>

      {!preview && (
        <div
          className={`kt-dropzone${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <p className="kt-dropzone-title">Drag and drop a CSV file here</p>
          <p className="kt-dropzone-subtitle">or</p>
          <button
            type="button"
            className="kt-auth-button kt-dropzone-browse"
            onClick={(e) => {
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
          >
            Browse files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="text/csv,.csv"
            hidden
            onChange={(e) => {
              loadFile(e.target.files[0])
              e.target.value = ''
            }}
          />
        </div>
      )}

      {previewLoading && <p className="kt-page-subtitle">Reading {file?.name}…</p>}
      {previewError && <div className="kt-auth-error">{previewError}</div>}

      {preview && (
        <div className="kt-import-mapping">
          <div className="kt-import-mapping-header">
            <h3>{file?.name}</h3>
            <button type="button" className="kt-category-link-button" onClick={handleReset} disabled={importing}>
              Choose a different file
            </button>
          </div>

          <p className="kt-page-subtitle">Preview (first {preview.rows.length} rows)</p>
          <div className="kt-import-preview-scroll">
            <table className="kt-import-preview-table">
              <thead>
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="kt-page-subtitle">
            Column mapping — auto-detected where possible. Adjust if your CSV uses different headers.
          </p>
          <div className="kt-import-mapping-grid">
            {MAPPING_FIELDS.map((f) => (
              <div className="kt-field" key={f.key}>
                <label htmlFor={`map-${f.key}`}>
                  {f.label}
                  {f.required && ' *'}
                </label>
                <select
                  id={`map-${f.key}`}
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">Not mapped</option>
                  {preview.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!requiredMapped && (
            <p className="kt-field-hint">Date, Supplier, and Amount must all be mapped before importing.</p>
          )}

          {importError && <div className="kt-auth-error">{importError}</div>}

          {importing ? (
            <div className="kt-import-progress">
              <div className="kt-import-progress-bar">
                <div className="kt-import-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <span>{Math.round(progress * 100)}%</span>
            </div>
          ) : (
            <button type="button" className="kt-auth-button" onClick={handleImport} disabled={!requiredMapped}>
              Import invoices
            </button>
          )}
        </div>
      )}

      {result && (
        <div className="kt-import-results">
          <h3>Import complete</h3>
          <ul className="kt-import-results-summary">
            <li>{result.imported} invoice{result.imported === 1 ? '' : 's'} imported successfully</li>
            <li>
              {result.skipped.length} row{result.skipped.length === 1 ? '' : 's'} skipped
              {result.skipped.length > 0 && (
                <button type="button" className="kt-category-link-button" onClick={() => setShowSkipped((s) => !s)}>
                  {showSkipped ? 'Hide' : 'Show'}
                </button>
              )}
            </li>
            {showSkipped && result.skipped.length > 0 && (
              <ul className="kt-import-issue-list">
                {result.skipped.map((row) => (
                  <li key={row.row}>
                    Row {row.row}: {row.reason}
                  </li>
                ))}
              </ul>
            )}
            <li>
              {result.duplicates_flagged.length} flagged as possible duplicate{result.duplicates_flagged.length === 1 ? '' : 's'}
              {result.duplicates_flagged.length > 0 && (
                <button type="button" className="kt-category-link-button" onClick={() => setShowDuplicates((s) => !s)}>
                  {showDuplicates ? 'Hide' : 'Show'}
                </button>
              )}
            </li>
            {showDuplicates && result.duplicates_flagged.length > 0 && (
              <ul className="kt-import-issue-list">
                {result.duplicates_flagged.map((row) => (
                  <li key={row.row}>
                    Row {row.row}: {row.reason}
                  </li>
                ))}
              </ul>
            )}
          </ul>
          <Link
            to={`/invoices?import_batch=${result.batch.batch_id}`}
            className="kt-auth-button kt-import-view-invoices"
          >
            View imported invoices
          </Link>
        </div>
      )}
    </div>
  )
}
