import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import { categoriesApi, rulesApi } from '../utils/api.js'

const MATCH_TYPE_OPTIONS = [
  { value: 'contains', label: 'Contains — supplier name contains this text' },
  { value: 'exact', label: 'Exact match — supplier name exactly matches' },
  { value: 'starts_with', label: 'Starts with — supplier name starts with this text' },
]

const MATCH_TYPE_LABELS = {
  contains: 'Contains',
  exact: 'Exact match',
  starts_with: 'Starts with',
}

const EMPTY_FORM = { name: '', matchType: 'contains', matchValue: '', categoryId: '', priority: 0, active: true }

function RuleForm({ values, onChange, categories, onSubmit, onCancel, saving, submitLabel }) {
  return (
    <form className="kt-rules-form" onSubmit={onSubmit}>
      <div className="kt-field">
        <label htmlFor="rule-name">Rule name</label>
        <input
          id="rule-name"
          type="text"
          value={values.name}
          maxLength={255}
          placeholder="e.g. BT Broadband"
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          required
        />
      </div>

      <div className="kt-field">
        <label htmlFor="rule-match-type">Match type</label>
        <select
          id="rule-match-type"
          value={values.matchType}
          onChange={(e) => onChange({ ...values, matchType: e.target.value })}
        >
          {MATCH_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="kt-field">
        <label htmlFor="rule-match-value">Match value</label>
        <input
          id="rule-match-value"
          type="text"
          value={values.matchValue}
          maxLength={255}
          placeholder="e.g. BT"
          onChange={(e) => onChange({ ...values, matchValue: e.target.value })}
          required
        />
      </div>

      <div className="kt-field">
        <label htmlFor="rule-category">Category</label>
        <select
          id="rule-category"
          value={values.categoryId}
          onChange={(e) => onChange({ ...values, categoryId: e.target.value })}
          required
        >
          <option value="">Select a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="kt-field kt-field-priority">
        <label htmlFor="rule-priority">Priority</label>
        <input
          id="rule-priority"
          type="number"
          value={values.priority}
          onChange={(e) => onChange({ ...values, priority: Number(e.target.value) })}
        />
      </div>

      <div className="kt-field kt-field-active-toggle">
        <label htmlFor="rule-active">Active</label>
        <button
          id="rule-active"
          type="button"
          role="switch"
          aria-checked={values.active}
          className={`kt-toggle${values.active ? ' on' : ''}`}
          onClick={() => onChange({ ...values, active: !values.active })}
        >
          <span className="kt-toggle-track">
            <span className="kt-toggle-thumb" />
          </span>
        </button>
      </div>

      <div className="kt-rules-form-actions">
        <button className="kt-auth-button" type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="kt-category-link-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default function RulesPage() {
  const { user } = useAuth()
  const token = user?.token

  const [rules, setRules] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [suggestions, setSuggestions] = useState([])
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false)
  const [creatingSuggestion, setCreatingSuggestion] = useState(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_FORM)
  const [savingNew, setSavingNew] = useState(false)

  const [editingRule, setEditingRule] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [savingEdit, setSavingEdit] = useState(false)

  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const [testSupplier, setTestSupplier] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [ruleRows, categoryRows, suggestionRows] = await Promise.all([
        rulesApi.list(token),
        categoriesApi.list(token),
        rulesApi.suggestions(token),
      ])
      setRules(ruleRows)
      setCategories(categoryRows)
      setSuggestions(suggestionRows)
    } catch (err) {
      setError(err.message || 'Failed to load transaction rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSavingNew(true)
    try {
      await rulesApi.create(
        {
          name: addForm.name.trim(),
          match_type: addForm.matchType,
          match_value: addForm.matchValue.trim(),
          category_id: Number(addForm.categoryId),
          priority: addForm.priority,
          active: addForm.active,
        },
        token
      )
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to create rule')
    } finally {
      setSavingNew(false)
    }
  }

  const startEdit = (rule) => {
    setError('')
    setEditingRule(rule)
    setEditForm({
      name: rule.name,
      matchType: rule.match_type,
      matchValue: rule.match_value,
      categoryId: String(rule.category_id),
      priority: rule.priority,
      active: rule.active,
    })
  }

  const handleEditSave = async (e) => {
    e.preventDefault()
    if (!editingRule) return
    setError('')
    setSavingEdit(true)
    try {
      await rulesApi.update(
        editingRule.id,
        {
          name: editForm.name.trim(),
          match_type: editForm.matchType,
          match_value: editForm.matchValue.trim(),
          category_id: Number(editForm.categoryId),
          priority: editForm.priority,
          active: editForm.active,
        },
        token
      )
      setEditingRule(null)
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to update rule')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleToggle = async (rule) => {
    setError('')
    setBusyId(rule.id)
    try {
      await rulesApi.toggle(rule.id, token)
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to update rule')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (rule) => {
    setError('')
    setBusyId(rule.id)
    try {
      await rulesApi.remove(rule.id, token)
      setConfirmingDeleteId(null)
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to delete rule')
    } finally {
      setBusyId(null)
    }
  }

  const handleCreateFromSuggestion = async (suggestion) => {
    setError('')
    setCreatingSuggestion(suggestion.supplier)
    try {
      await rulesApi.create(
        {
          name: suggestion.supplier,
          match_type: 'contains',
          match_value: suggestion.supplier,
          category_id: suggestion.category_id,
          priority: 0,
          active: true,
        },
        token
      )
      await loadAll()
    } catch (err) {
      setError(err.message || 'Failed to create rule from suggestion')
    } finally {
      setCreatingSuggestion(null)
    }
  }

  const handleTest = async (e) => {
    e.preventDefault()
    if (!testSupplier.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await rulesApi.test(testSupplier.trim(), token)
      setTestResult(result)
    } catch (err) {
      setError(err.message || 'Failed to test rule')
    } finally {
      setTesting(false)
    }
  }

  const showSuggestions = !suggestionsDismissed && suggestions.length > 0

  return (
    <div>
      <h1 className="kt-page-title">Transaction Rules</h1>
      <p className="kt-page-subtitle">
        Rules automatically categorise invoices based on supplier name. Rules take priority over AI
        suggestions and work even when AI is disabled. Rules are applied when invoices are uploaded,
        imported, or picked up from the watched folder.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {showSuggestions && (
        <div className="kt-rules-suggestions">
          <p className="kt-rules-suggestions-title">
            Based on your invoice history, we suggest these rules:
          </p>
          <ul className="kt-rules-suggestions-list">
            {suggestions.map((s) => (
              <li key={s.supplier} className="kt-rules-suggestion-row">
                <span className="kt-rules-suggestion-supplier">{s.supplier}</span>
                <span className="kt-rules-suggestion-arrow">→</span>
                <span
                  className="kt-category-swatch"
                  style={{ background: s.category_colour }}
                  aria-hidden="true"
                />
                <span className="kt-rules-suggestion-category">{s.category_name}</span>
                <button
                  type="button"
                  className="kt-category-link-button"
                  onClick={() => handleCreateFromSuggestion(s)}
                  disabled={creatingSuggestion === s.supplier}
                >
                  {creatingSuggestion === s.supplier ? 'Creating…' : 'Create rule'}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="kt-category-link-button"
            onClick={() => setSuggestionsDismissed(true)}
          >
            Dismiss suggestions
          </button>
        </div>
      )}

      <div className="kt-categories-toolbar">
        <button
          type="button"
          className="kt-auth-button kt-categories-add-button"
          onClick={() => setShowAddForm((v) => !v)}
        >
          {showAddForm ? 'Cancel' : '+ Add rule'}
        </button>
      </div>

      {showAddForm && (
        <RuleForm
          values={addForm}
          onChange={setAddForm}
          categories={categories}
          onSubmit={handleAdd}
          saving={savingNew}
          submitLabel="Add rule"
        />
      )}

      {loading ? (
        <p className="kt-page-subtitle">Loading rules…</p>
      ) : rules.length === 0 ? (
        <div className="kt-categories-empty">
          No rules yet. Add your first rule or use the suggestions above to get started quickly.
        </div>
      ) : (
        <div className="kt-rules-table-wrapper">
          <table className="kt-rules-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Rule name</th>
                <th>Match type</th>
                <th>Match value</th>
                <th>Category</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.priority}</td>
                  <td>{rule.name}</td>
                  <td>{MATCH_TYPE_LABELS[rule.match_type] || rule.match_type}</td>
                  <td>{rule.match_value}</td>
                  <td>
                    <span className="kt-rules-category-cell">
                      <span
                        className="kt-category-swatch"
                        style={{ background: rule.category_colour }}
                        aria-hidden="true"
                      />
                      {rule.category_name}
                    </span>
                  </td>
                  <td>
                    <span className={`kt-category-status${rule.active ? '' : ' inactive'}`}>
                      {rule.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="kt-category-actions">
                      <button type="button" className="kt-category-link-button" onClick={() => startEdit(rule)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="kt-category-link-button"
                        onClick={() => handleToggle(rule)}
                        disabled={busyId === rule.id}
                      >
                        {rule.active ? 'Disable' : 'Enable'}
                      </button>
                      {confirmingDeleteId === rule.id ? (
                        <>
                          <span className="kt-category-confirm-text">Delete?</span>
                          <button
                            type="button"
                            className="kt-category-link-button kt-category-danger"
                            onClick={() => handleDelete(rule)}
                            disabled={busyId === rule.id}
                          >
                            {busyId === rule.id ? 'Deleting…' : 'Yes, delete'}
                          </button>
                          <button
                            type="button"
                            className="kt-category-link-button"
                            onClick={() => setConfirmingDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="kt-category-link-button kt-category-danger"
                          onClick={() => setConfirmingDeleteId(rule.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="kt-rules-test">
        <h2 className="kt-panel-title">Test a supplier name</h2>
        <form className="kt-rules-test-form" onSubmit={handleTest}>
          <input
            type="text"
            value={testSupplier}
            onChange={(e) => setTestSupplier(e.target.value)}
            placeholder="Enter a supplier name to see which rule applies"
          />
          <button type="submit" className="kt-auth-button" disabled={testing || !testSupplier.trim()}>
            {testing ? 'Testing…' : 'Test'}
          </button>
        </form>
        {testResult && (
          <p className="kt-rules-test-result">
            {testResult.matched ? (
              <>
                Would be categorised as <strong>{testResult.category_name}</strong> by rule:{' '}
                <strong>{testResult.rule_name}</strong>
              </>
            ) : (
              'No rule matches this supplier name. AI extraction or manual entry will be used.'
            )}
          </p>
        )}
      </div>

      {editingRule && (
        <div className="kt-modal-overlay" onClick={() => setEditingRule(null)}>
          <div className="kt-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="kt-modal-header">
              <h3 className="kt-modal-title">Edit rule</h3>
              <button type="button" className="kt-modal-close" aria-label="Close" onClick={() => setEditingRule(null)}>
                ×
              </button>
            </div>
            <div className="kt-modal-body">
              <RuleForm
                values={editForm}
                onChange={setEditForm}
                categories={categories}
                onSubmit={handleEditSave}
                onCancel={() => setEditingRule(null)}
                saving={savingEdit}
                submitLabel="Save changes"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
