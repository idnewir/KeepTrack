import { useEffect, useState } from 'react'
import { terminologyApi } from '../../utils/api.js'
import { TERMINOLOGY_DEFAULTS, useTerminology } from '../../context/TerminologyContext.jsx'

const TERM_FIELDS = [
  { key: 'term_expenses', label: 'Expenses label', hint: 'e.g. Invoices, Bills, Expenses' },
  { key: 'term_income', label: 'Income label', hint: 'e.g. Contributions, Income, Revenue, Membership Fees' },
  { key: 'term_projects', label: 'Projects label', hint: 'e.g. Projects, Future Expenses, Planned Spend' },
  {
    key: 'term_reconciliation',
    label: 'Reconciliation label',
    hint: 'e.g. Reconciliation, Monthly Check, Bank Reconciliation',
  },
  { key: 'term_reserve', label: 'Reserve label', hint: 'e.g. Target Reserve, Rainy Day Fund, Savings Goal' },
  { key: 'site_name', label: 'Site/instance name', hint: 'e.g. KHOC, Personal, My Business — shown in the header' },
]

export default function TerminologySettings({ token }) {
  const terminology = useTerminology()

  const [termForm, setTermForm] = useState(TERMINOLOGY_DEFAULTS)
  const [termFormSeeded, setTermFormSeeded] = useState(false)
  const [savingTerminology, setSavingTerminology] = useState(false)
  const [terminologyError, setTerminologyError] = useState('')
  const [resetStep, setResetStep] = useState('idle') // 'idle' | 'confirm'
  const [resettingTerminology, setResettingTerminology] = useState(false)

  useEffect(() => {
    if (!termFormSeeded && !terminology.loading) {
      setTermForm({
        term_expenses: terminology.term_expenses,
        term_income: terminology.term_income,
        term_projects: terminology.term_projects,
        term_reconciliation: terminology.term_reconciliation,
        term_reserve: terminology.term_reserve,
        site_name: terminology.site_name,
      })
      setTermFormSeeded(true)
    }
  }, [terminology, termFormSeeded])

  const handleTermFieldChange = (key, value) => setTermForm((f) => ({ ...f, [key]: value }))

  const handleSaveTerminology = async () => {
    setTerminologyError('')
    setSavingTerminology(true)
    try {
      await terminologyApi.update(termForm, token)
      await terminology.refresh()
    } catch (err) {
      setTerminologyError(err.message || 'Failed to save terminology')
    } finally {
      setSavingTerminology(false)
    }
  }

  const handleRequestResetTerminology = () => setResetStep('confirm')
  const handleCancelResetTerminology = () => setResetStep('idle')

  const handleConfirmResetTerminology = async () => {
    setTerminologyError('')
    setResettingTerminology(true)
    try {
      await terminologyApi.update(TERMINOLOGY_DEFAULTS, token)
      setTermForm(TERMINOLOGY_DEFAULTS)
      await terminology.refresh()
      setResetStep('idle')
    } catch (err) {
      setTerminologyError(err.message || 'Failed to reset terminology')
    } finally {
      setResettingTerminology(false)
    }
  }

  return (
    <div>
      <h2 className="kt-panel-title">Terminology</h2>
      <p className="kt-panel-subtitle">
        Rename the labels Keep Track uses throughout the app, so it reads naturally for how you
        actually use it.
      </p>
      <div className="kt-terminology-layout">
        <div className="kt-terminology-fields">
          {terminologyError && (
            <div className="kt-auth-error" style={{ marginBottom: 12 }}>
              {terminologyError}
            </div>
          )}
          {TERM_FIELDS.map((field) => (
            <div className="kt-field" key={field.key}>
              <label htmlFor={`term-${field.key}`}>{field.label}</label>
              <input
                id={`term-${field.key}`}
                type="text"
                maxLength={100}
                value={termForm[field.key]}
                onChange={(e) => handleTermFieldChange(field.key, e.target.value)}
                disabled={terminology.loading}
              />
              <span className="kt-field-note">{field.hint}</span>
            </div>
          ))}

          <div className="kt-terminology-actions">
            <button
              type="button"
              className="kt-auth-button"
              onClick={handleSaveTerminology}
              disabled={terminology.loading || savingTerminology}
            >
              {savingTerminology ? 'Saving…' : 'Save all'}
            </button>

            {resetStep === 'confirm' ? (
              <>
                <span className="kt-category-confirm-text">Reset every label to its default?</span>
                <button
                  type="button"
                  className="kt-category-link-button kt-category-danger"
                  onClick={handleConfirmResetTerminology}
                  disabled={resettingTerminology}
                >
                  {resettingTerminology ? 'Resetting…' : 'Yes, reset'}
                </button>
                <button type="button" className="kt-category-link-button" onClick={handleCancelResetTerminology}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="kt-category-link-button kt-category-danger"
                onClick={handleRequestResetTerminology}
              >
                Reset to defaults
              </button>
            )}
          </div>
        </div>

        <div className="kt-terminology-preview">
          <span className="kt-terminology-preview-label">Live preview</span>
          <div className="kt-terminology-preview-sidebar">
            <div className="kt-terminology-preview-brand">
              Keep Track
              {termForm.site_name && termForm.site_name !== 'Keep Track' && ` — ${termForm.site_name}`}
            </div>
            <div className="kt-terminology-preview-link">Dashboard</div>
            <div className="kt-terminology-preview-link">{termForm.term_expenses || 'Invoices'}</div>
            <div className="kt-terminology-preview-link">{termForm.term_income || 'Contributions'}</div>
            <div className="kt-terminology-preview-link">{termForm.term_reconciliation || 'Reconciliation'}</div>
            <div className="kt-terminology-preview-link">{termForm.term_projects || 'Projects'}</div>
            <div className="kt-terminology-preview-link">Reports</div>
          </div>
        </div>
      </div>
    </div>
  )
}
