import { useEffect, useState } from 'react'
import { budgetsApi } from '../../utils/api.js'
import { BUDGET_TERMINOLOGY_DEFAULTS, useBudgetTerminology } from '../../context/BudgetTerminologyContext.jsx'

const TERM_FIELDS = [
  { key: 'budget_term_module', label: 'Module name label', hint: 'e.g. Budget Planning, Envelopes' },
  { key: 'budget_term_budget', label: 'Budget label', hint: 'e.g. Budget, Allowance, Envelope' },
  { key: 'budget_term_savings_goal', label: 'Savings goal label', hint: 'e.g. Savings Goal, Sinking Fund' },
]

export default function BudgetTerminologySettings({ token }) {
  const terminology = useBudgetTerminology()

  const [form, setForm] = useState(BUDGET_TERMINOLOGY_DEFAULTS)
  const [seeded, setSeeded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!seeded && !terminology.loading) {
      setForm({
        budget_term_module: terminology.budget_term_module,
        budget_term_budget: terminology.budget_term_budget,
        budget_term_savings_goal: terminology.budget_term_savings_goal,
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
      await budgetsApi.updateTerminology(form, token)
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
      <h2 className="kt-panel-title">Budget Planning terminology</h2>
      <p className="kt-panel-subtitle">
        Rename the labels the Budget Planning module uses. These labels update throughout the app
        automatically.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {TERM_FIELDS.map((field) => (
        <div className="kt-field" key={field.key}>
          <label htmlFor={`budget-term-${field.key}`}>{field.label}</label>
          <input
            id={`budget-term-${field.key}`}
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
