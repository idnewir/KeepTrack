import { useEffect, useState } from 'react'
import { debtsApi } from '../../utils/api.js'
import { DEBT_TERMINOLOGY_DEFAULTS, useDebtTerminology } from '../../context/DebtTerminologyContext.jsx'

const TERM_FIELDS = [
  { key: 'debt_term_module', label: 'Module name label', hint: 'e.g. Debt Tracking, Loans & Cards' },
  { key: 'debt_term_debt', label: 'Debt label', hint: 'e.g. Debt, Loan, Balance' },
  { key: 'debt_term_payment', label: 'Payment label', hint: 'e.g. Payment, Repayment, Instalment' },
]

export default function DebtTerminologySettings({ token }) {
  const terminology = useDebtTerminology()

  const [form, setForm] = useState(DEBT_TERMINOLOGY_DEFAULTS)
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!seeded && !terminology.loading) {
      setForm({
        debt_term_module: terminology.debt_term_module,
        debt_term_debt: terminology.debt_term_debt,
        debt_term_payment: terminology.debt_term_payment,
      })
      setSeeded(true)
    }
  }, [terminology, seeded])

  const handleChange = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      await debtsApi.updateTerminology(form, token)
      await terminology.refresh()
      setSaved(true)
    } catch (err) {
      setError(err.message || 'Failed to save terminology')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: 32 }}>
      <h2 className="kt-panel-title">Debt Tracking terminology</h2>
      <p className="kt-panel-subtitle">
        Rename the labels the Debt Tracking module uses. These labels update throughout the app
        automatically.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {TERM_FIELDS.map((field) => (
        <div className="kt-field" key={field.key}>
          <label htmlFor={`debt-term-${field.key}`}>{field.label}</label>
          <input
            id={`debt-term-${field.key}`}
            type="text"
            maxLength={100}
            value={form[field.key]}
            onChange={(e) => handleChange(field.key, e.target.value)}
            disabled={terminology.loading}
          />
          <span className="kt-field-note">{field.hint}</span>
        </div>
      ))}

      <div className="kt-terminology-actions">
        <button
          type="button"
          className="kt-auth-button"
          onClick={handleSave}
          disabled={terminology.loading || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="kt-settings-row-status">Saved.</span>}
      </div>
    </div>
  )
}
