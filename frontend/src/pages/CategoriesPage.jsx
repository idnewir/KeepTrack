import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/AuthContext.jsx'
import { categoriesApi } from '../utils/api.js'

const DEFAULT_COLOUR = '#2D6B9F'

export default function CategoriesPage() {
  const { user } = useAuth()
  const token = user?.token

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColour, setNewColour] = useState(DEFAULT_COLOUR)
  const [savingNew, setSavingNew] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColour, setEditColour] = useState(DEFAULT_COLOUR)
  const [savingEdit, setSavingEdit] = useState(false)

  const [confirmingId, setConfirmingId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const loadCategories = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await categoriesApi.listAll(token)
      setCategories(data)
    } catch (err) {
      setError(err.message || 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSavingNew(true)
    try {
      await categoriesApi.create({ name: newName.trim(), colour: newColour }, token)
      setNewName('')
      setNewColour(DEFAULT_COLOUR)
      setShowAddForm(false)
      await loadCategories()
    } catch (err) {
      setError(err.message || 'Failed to add category')
    } finally {
      setSavingNew(false)
    }
  }

  const startEdit = (category) => {
    setError('')
    setEditingId(category.id)
    setEditName(category.name)
    setEditColour(category.colour)
  }

  const handleEditSave = async (id) => {
    setError('')
    setSavingEdit(true)
    try {
      await categoriesApi.update(id, { name: editName.trim(), colour: editColour }, token)
      setEditingId(null)
      await loadCategories()
    } catch (err) {
      setError(err.message || 'Failed to update category')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeactivate = async (id) => {
    setError('')
    setBusyId(id)
    try {
      await categoriesApi.deactivate(id, token)
      setConfirmingId(null)
      await loadCategories()
    } catch (err) {
      setError(err.message || 'Failed to deactivate category')
    } finally {
      setBusyId(null)
    }
  }

  const handleRestore = async (id) => {
    setError('')
    setBusyId(id)
    try {
      await categoriesApi.restore(id, token)
      await loadCategories()
    } catch (err) {
      setError(err.message || 'Failed to restore category')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <h1 className="kt-page-title">Categories</h1>
      <p className="kt-page-subtitle">
        Manage the categories used to classify invoices. Deactivating a category
        keeps it on any invoice it's already used against — it just won't be
        offered for new ones.
      </p>

      {error && (
        <div className="kt-auth-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="kt-categories-toolbar">
        <button
          type="button"
          className="kt-auth-button kt-categories-add-button"
          onClick={() => setShowAddForm((v) => !v)}
        >
          {showAddForm ? 'Cancel' : '+ Add category'}
        </button>
      </div>

      {showAddForm && (
        <form className="kt-categories-form" onSubmit={handleAdd}>
          <div className="kt-field">
            <label htmlFor="new-category-name">Name</label>
            <input
              id="new-category-name"
              type="text"
              value={newName}
              maxLength={100}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </div>
          <div className="kt-field kt-field-colour">
            <label htmlFor="new-category-colour">Colour</label>
            <input
              id="new-category-colour"
              type="color"
              value={newColour}
              onChange={(e) => setNewColour(e.target.value)}
            />
          </div>
          <button className="kt-auth-button" type="submit" disabled={savingNew}>
            {savingNew ? 'Adding…' : 'Add category'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="kt-page-subtitle">Loading categories…</p>
      ) : categories.length === 0 ? (
        <div className="kt-categories-empty">
          No categories yet. Add your first category to start classifying invoices.
        </div>
      ) : (
        <ul className="kt-categories-list">
          {categories.map((category) => (
            <li key={category.id} className="kt-category-row">
              {editingId === category.id ? (
                <>
                  <input
                    type="color"
                    value={editColour}
                    onChange={(e) => setEditColour(e.target.value)}
                    className="kt-category-swatch-input"
                    aria-label={`Colour for ${category.name}`}
                  />
                  <input
                    type="text"
                    value={editName}
                    maxLength={100}
                    onChange={(e) => setEditName(e.target.value)}
                    className="kt-category-name-input"
                    aria-label="Category name"
                  />
                  <div className="kt-category-actions">
                    <button
                      type="button"
                      className="kt-category-link-button"
                      onClick={() => handleEditSave(category.id)}
                      disabled={savingEdit || !editName.trim()}
                    >
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="kt-category-link-button"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span
                    className="kt-category-swatch"
                    style={{ background: category.colour }}
                    aria-hidden="true"
                  />
                  <span className="kt-category-name">{category.name}</span>
                  <span className={`kt-category-status${category.active ? '' : ' inactive'}`}>
                    {category.active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="kt-category-actions">
                    {category.active ? (
                      <>
                        <button
                          type="button"
                          className="kt-category-link-button"
                          onClick={() => startEdit(category)}
                        >
                          Edit
                        </button>
                        {confirmingId === category.id ? (
                          <>
                            <span className="kt-category-confirm-text">Deactivate?</span>
                            <button
                              type="button"
                              className="kt-category-link-button kt-category-danger"
                              onClick={() => handleDeactivate(category.id)}
                              disabled={busyId === category.id}
                            >
                              {busyId === category.id ? 'Deactivating…' : 'Yes, deactivate'}
                            </button>
                            <button
                              type="button"
                              className="kt-category-link-button"
                              onClick={() => setConfirmingId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="kt-category-link-button kt-category-danger"
                            onClick={() => setConfirmingId(category.id)}
                          >
                            Deactivate
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="kt-category-link-button"
                        onClick={() => handleRestore(category.id)}
                        disabled={busyId === category.id}
                      >
                        {busyId === category.id ? 'Restoring…' : 'Restore'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
