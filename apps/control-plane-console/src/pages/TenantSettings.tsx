import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getTenant, updateTenantAuth, type UpdateTenantAuthPayload, type TenantRecord } from '../api/controlPlaneClient'
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

function createEmptyProvider(): ProviderForm {
  return { enabled: false, clientIdRef: '', clientSecretRef: '', redirectUris: '' }
}

function deriveProviderForm(
  source?: { enabled?: boolean; clientIdRef?: string; clientSecretRef?: string; redirectUris?: string[] } | null,
): ProviderForm {
  if (!source) {
    return createEmptyProvider()
  }
  return {
    enabled: source.enabled ?? true,
    clientIdRef: source.clientIdRef ?? '',
    clientSecretRef: source.clientSecretRef ?? '',
    redirectUris: source.redirectUris?.join(', ') ?? '',
  }
}

interface TenantSettingsProps {
  tenantId: string | null
  tenant: TenantRecord | null
  onBack: () => void
}

export default function TenantSettings({ tenantId, tenant, onBack }: TenantSettingsProps) {
  const session = useSession()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [google, setGoogle] = useState<ProviderForm>(createEmptyProvider)
  const [microsoft, setMicrosoft] = useState<ProviderForm>(createEmptyProvider)

  const canManage = session.actor?.roles?.includes('SUPER_ADMIN') ?? false

  const loadTenant = useCallback(
    async (id: string, options?: { preserveSuccess?: boolean }) => {
      setLoading(true)
      setError(null)
      if (!options?.preserveSuccess) {
        setSuccess(null)
      }
      try {
        const t = await getTenant(id)
        const g = t.auth?.google
        const m = t.auth?.microsoft
        setGoogle({
          enabled: Boolean(g),
          clientIdRef: g?.clientIdRef ?? '',
          clientSecretRef: g?.clientSecretRef ?? '',
          redirectUris: g?.redirectUris?.join(', ') ?? '',
        })
        setMicrosoft({
          enabled: Boolean(m),
          clientIdRef: m?.clientIdRef ?? '',
          clientSecretRef: m?.clientSecretRef ?? '',
          redirectUris: m?.redirectUris?.join(', ') ?? '',
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!tenantId || !canManage) return
    void loadTenant(tenantId)
  }, [tenantId, canManage, loadTenant])

  useEffect(() => {
    if (!tenantId || !tenant || tenant.id !== tenantId) {
      return
    }
    const g = tenant.auth?.google
    const m = tenant.auth?.microsoft
    setGoogle(deriveProviderForm(g))
    setMicrosoft(deriveProviderForm(m))
  }, [tenant, tenantId])

  if (!tenantId) return null

  if (!canManage) {
    return (
      <section className="panel narrow-panel">
        <h2>Tenant Settings</h2>
        {loading && <div className="callout info">Loading tenant settings…</div>}
        <div className="callout error">Forbidden: Tenant settings can only be managed by Super Admin</div>
        <div className="actions">
          <button className="ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    )
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const payload: UpdateTenantAuthPayload = {}
    if (google.enabled) {
      const redirects = parseRedirects(google.redirectUris)
      if (!google.clientIdRef || !google.clientSecretRef || redirects.length === 0) {
        setError('Google configuration incomplete')
        return
      }
      payload.google = { clientIdRef: google.clientIdRef.trim(), clientSecretRef: google.clientSecretRef.trim(), redirectUris: redirects }
    } else {
      payload.google = null
    }
    if (microsoft.enabled) {
      const redirects = parseRedirects(microsoft.redirectUris)
      if (!microsoft.clientIdRef || !microsoft.clientSecretRef || redirects.length === 0) {
        setError('Microsoft configuration incomplete')
        return
      }
      payload.microsoft = { clientIdRef: microsoft.clientIdRef.trim(), clientSecretRef: microsoft.clientSecretRef.trim(), redirectUris: redirects }
    } else {
      payload.microsoft = null
    }

    setSaving(true)
    try {
      await updateTenantAuth(tenantId, payload)
      await loadTenant(tenantId, { preserveSuccess: true })
      setSuccess('Updated identity providers')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel narrow-panel">
      <h2>Tenant Settings</h2>
      <p className="subtitle">
        Manage social identity providers for tenant <strong>{tenant?.name ?? tenantId}</strong> ({tenantId})
      </p>
      {loading && <div className="callout info">Loading tenant settings…</div>}
      {error && <div className="callout error">{error}</div>}
      {success && <div className="callout success">{success}</div>}
      <form className="form-grid" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Google</legend>
          <p className="hint">Check Enable before saving or this provider will be removed.</p>
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
          <p className="hint">Check Enable before saving or this provider will be removed.</p>
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
          <button type="submit" className="primary" disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button type="button" className="ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </section>
  )
}
