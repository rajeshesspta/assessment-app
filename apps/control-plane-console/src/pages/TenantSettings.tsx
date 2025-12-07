import { useEffect, useState } from 'react'
import { getTenant, updateTenantAuth } from '../api/controlPlaneClient'
import { useSession } from '../context/session-context'

type ProviderForm = {
  enabled: boolean
  clientIdRef: string
  clientSecretRef: string
  redirectUris: string
}

function parseRedirects(value = '') {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function TenantSettings({ tenantId, onBack }: { tenantId: string | null; onBack: () => void }) {
  const session = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [google, setGoogle] = useState<ProviderForm>({ enabled: false, clientIdRef: '', clientSecretRef: '', redirectUris: '' })
  const [microsoft, setMicrosoft] = useState<ProviderForm>(google)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    getTenant(tenantId)
      .then((t) => {
        const g = t.auth?.google
        const m = t.auth?.microsoft
        setGoogle({
          enabled: Boolean(g),
          clientIdRef: (g as any)?.clientIdRef ?? '',
          clientSecretRef: (g as any)?.clientSecretRef ?? '',
          redirectUris: (g as any)?.redirectUris?.join(',') ?? '',
        })
        setMicrosoft({
          enabled: Boolean(m),
          clientIdRef: (m as any)?.clientIdRef ?? '',
          clientSecretRef: (m as any)?.clientSecretRef ?? '',
          redirectUris: (m as any)?.redirectUris?.join(',') ?? '',
        })
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [tenantId])

  if (!tenantId) return null

  const canManage = session.actor?.roles?.includes('SUPER_ADMIN') ?? false

  if (!canManage) {
    return (
      <section className="panel narrow-panel">
        <h2>Tenant Settings</h2>
        <div className="callout error">Forbidden: Tenant settings can only be managed by Super Admin</div>
        <div className="actions">
          <button className="ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    )
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const payload: any = {}
    if (google.enabled) {
      const redirects = parseRedirects(google.redirectUris)
      if (!google.clientIdRef || !google.clientSecretRef || redirects.length === 0) {
        setError('Google configuration incomplete')
        return
      }
      payload.google = { clientIdRef: google.clientIdRef, clientSecretRef: google.clientSecretRef, redirectUris: redirects }
    }
    if (microsoft.enabled) {
      const redirects = parseRedirects(microsoft.redirectUris)
      if (!microsoft.clientIdRef || !microsoft.clientSecretRef || redirects.length === 0) {
        setError('Microsoft configuration incomplete')
        return
      }
      payload.microsoft = { clientIdRef: microsoft.clientIdRef, clientSecretRef: microsoft.clientSecretRef, redirectUris: redirects }
    }

    setLoading(true)
    try {
      await updateTenantAuth(tenantId, payload)
      setSuccess('Updated identity providers')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel narrow-panel">
      <h2>Tenant Settings</h2>
      <p className="subtitle">Manage social identity providers for tenant <strong>{tenantId}</strong></p>
      {error && <div className="callout error">{error}</div>}
      {success && <div className="callout success">{success}</div>}
      <form className="form-grid" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Google</legend>
          <label>
            <input type="checkbox" checked={google.enabled} onChange={(e) => setGoogle({ ...google, enabled: e.target.checked })} /> Enable
          </label>
          <label>
            Client ID Secret Ref
            <input value={google.clientIdRef} onChange={(e) => setGoogle({ ...google, clientIdRef: e.target.value })} />
          </label>
          <label>
            Client Secret Ref
            <input value={google.clientSecretRef} onChange={(e) => setGoogle({ ...google, clientSecretRef: e.target.value })} />
          </label>
          <label>
            Redirect URIs (comma separated)
            <input value={google.redirectUris} onChange={(e) => setGoogle({ ...google, redirectUris: e.target.value })} />
          </label>
        </fieldset>

        <fieldset>
          <legend>Microsoft</legend>
          <label>
            <input type="checkbox" checked={microsoft.enabled} onChange={(e) => setMicrosoft({ ...microsoft, enabled: e.target.checked })} /> Enable
          </label>
          <label>
            Client ID Secret Ref
            <input value={microsoft.clientIdRef} onChange={(e) => setMicrosoft({ ...microsoft, clientIdRef: e.target.value })} />
          </label>
          <label>
            Client Secret Ref
            <input value={microsoft.clientSecretRef} onChange={(e) => setMicrosoft({ ...microsoft, clientSecretRef: e.target.value })} />
          </label>
          <label>
            Redirect URIs (comma separated)
            <input value={microsoft.redirectUris} onChange={(e) => setMicrosoft({ ...microsoft, redirectUris: e.target.value })} />
          </label>
        </fieldset>

        <div className="actions span-2">
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Saving…' : 'Save settings'}
          </button>
          <button type="button" className="ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </section>
  )
}
