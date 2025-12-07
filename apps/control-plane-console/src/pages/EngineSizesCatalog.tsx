import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createEngineSize,
  deleteEngineSize,
  listEngineSizes,
  updateEngineSize,
  type EngineSizeRecord,
} from '../api/controlPlaneClient'
import { useSession } from '../context/session-context'

function createEmptyEditor() {
  return {
    id: null as string | null,
    name: '',
    description: '',
  }
}

type EditorState = ReturnType<typeof createEmptyEditor>

interface EngineSizesCatalogProps {
  onBack: () => void
}

function formatTimestamp(value?: string) {
  if (!value) {
    return 'Never'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown'
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function sortCatalog(entries: EngineSizeRecord[]) {
  return [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export default function EngineSizesCatalog({ onBack }: EngineSizesCatalogProps) {
  const session = useSession()
  const canManage = session.actor?.roles?.includes('SUPER_ADMIN') ?? false
  const [catalog, setCatalog] = useState<EngineSizeRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState>(() => createEmptyEditor())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)

  const selectedRecord = useMemo(() => {
    if (!editor.id) {
      return null
    }
    return catalog.find((entry) => entry.id === editor.id) ?? null
  }, [catalog, editor.id])

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const records = await listEngineSizes()
      setCatalog(records)
      setEditor((prev) => {
        if (!prev.id) {
          return prev
        }
        const refreshed = records.find((entry) => entry.id === prev.id)
        if (!refreshed) {
          return createEmptyEditor()
        }
        return { id: refreshed.id, name: refreshed.name, description: refreshed.description ?? '' }
      })
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canManage) {
      return
    }
    void loadCatalog()
  }, [canManage, loadCatalog])

  const resetEditor = useCallback(() => {
    setEditor(createEmptyEditor())
    setSaveError(null)
    setSaveSuccess(null)
  }, [])

  const startEditing = useCallback((record: EngineSizeRecord) => {
    setEditor({ id: record.id, name: record.name, description: record.description ?? '' })
    setSaveError(null)
    setSaveSuccess(null)
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaveError(null)
    setSaveSuccess(null)
    const trimmedName = editor.name.trim()
    const trimmedDescription = editor.description.trim()
    if (!trimmedName) {
      setSaveError('Name is required')
      return
    }
    const payload = {
      name: trimmedName,
      description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
    }
    setSaving(true)
    try {
      let record: EngineSizeRecord
      if (editor.id) {
        record = await updateEngineSize(editor.id, payload)
        setSaveSuccess('Engine size updated')
      } else {
        record = await createEngineSize(payload)
        setSaveSuccess('Engine size created')
      }
      setCatalog((prev) => {
        const next = prev.some((entry) => entry.id === record.id)
          ? prev.map((entry) => (entry.id === record.id ? record : entry))
          : [record, ...prev]
        return sortCatalog(next)
      })
      setEditor({ id: record.id, name: record.name, description: record.description ?? '' })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record: EngineSizeRecord) => {
    if (!window.confirm(`Delete "${record.name}"? Tenants referencing it must be updated first.`)) {
      return
    }
    setDeleteError(null)
    setDeleteBusyId(record.id)
    try {
      await deleteEngineSize(record.id)
      setCatalog((prev) => prev.filter((entry) => entry.id !== record.id))
      setEditor((prev) => (prev.id === record.id ? createEmptyEditor() : prev))
      setSaveSuccess('Engine size deleted')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteBusyId(null)
    }
  }

  if (!canManage) {
    return (
      <section className="panel narrow-panel">
        <h2>Engine Size Catalog</h2>
        <div className="callout error">Forbidden: only Super Admins may manage engine sizes.</div>
        <div className="actions">
          <button className="ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="panel engine-catalog-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Power Units</p>
          <h2>Engine Size Catalog</h2>
          <p className="subtitle">Define the canonical engine sizes Super Admins can assign to tenants.</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={resetEditor} disabled={saving}>
            New entry
          </button>
          <button className="ghost" onClick={() => void loadCatalog()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <div className="engine-catalog-grid">
        <div className="engine-catalog-list">
          <div className="catalog-list-header">
            <div>
              <p className="eyebrow">Definitions</p>
              <h3>{catalog.length} engine sizes</h3>
            </div>
            <div className="catalog-status">
              <span className={`status-dot ${loading ? 'loading' : 'success'}`}></span>
              <span className="status-label">{loading ? 'Syncing catalog' : 'Up to date'}</span>
            </div>
          </div>

          {loadError && <div className="callout error">{loadError}</div>}
          {deleteError && <div className="callout error">{deleteError}</div>}

          {loading && catalog.length === 0 ? (
            <div className="placeholder">Loading engine sizes…</div>
          ) : catalog.length === 0 ? (
            <div className="engine-empty-state">
              <p>No engine sizes have been defined yet.</p>
              <button className="ghost" onClick={resetEditor}>
                Create the first entry
              </button>
            </div>
          ) : (
            <div className="engine-card-grid">
              {catalog.map((record) => (
                <article
                  key={record.id}
                  className={`engine-card ${editor.id === record.id ? 'active' : ''}`}
                  aria-current={editor.id === record.id}
                >
                  <div>
                    <div className="engine-card-title-row">
                      <p className="engine-card-name">{record.name}</p>
                      <span className="engine-card-updated">Updated {formatTimestamp(record.updatedAt)}</span>
                    </div>
                    <p className="engine-card-desc">{record.description ?? 'No description provided.'}</p>
                    <p className="engine-card-meta">ID {record.id}</p>
                  </div>
                  <div className="engine-card-actions">
                    <button className="ghost" type="button" onClick={() => startEditing(record)}>
                      Edit
                    </button>
                    <button
                      className="ghost danger"
                      type="button"
                      disabled={deleteBusyId === record.id}
                      onClick={() => handleDelete(record)}
                    >
                      {deleteBusyId === record.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="engine-editor">
          <p className="eyebrow">{editor.id ? 'Edit entry' : 'Create entry'}</p>
          <h3>{editor.id ? 'Update engine size' : 'Add engine size'}</h3>
          {selectedRecord && (
            <p className="engine-editor-meta">Linked to {selectedRecord.updatedAt ? formatTimestamp(selectedRecord.updatedAt) : '—'}</p>
          )}
          {saveError && <div className="callout error">{saveError}</div>}
          {saveSuccess && <div className="callout success">{saveSuccess}</div>}
          <form className="engine-editor-form" onSubmit={handleSubmit}>
            <label>
              <span>Name</span>
              <input
                value={editor.name}
                onChange={(event) => setEditor((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g., Turbo V8"
                required
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                value={editor.description}
                onChange={(event) => setEditor((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Optional context for internal admins"
                rows={4}
              />
            </label>
            <div className="editor-actions">
              <button className="primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editor.id ? 'Save changes' : 'Create engine size'}
              </button>
              {editor.id && (
                <button type="button" className="ghost" onClick={resetEditor} disabled={saving}>
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </aside>
      </div>
    </section>
  )
}
