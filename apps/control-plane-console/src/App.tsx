import { useMemo, useState, type FormEvent } from 'react'
import './App.css'
import { controlPlaneApiBaseUrl } from './config'
import { useTenants } from './hooks/useTenants'
import { useSession } from './context/session-context'
import { AuthScreens } from './components/AuthGate'
import { createTenant } from './api/controlPlaneClient'

type TenantStatus = 'active' | 'paused' | 'deleting'

const statusLabels: Record<TenantStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  deleting: 'Deleting',
}

const statusClass: Record<TenantStatus, string> = {
  active: 'badge-success',
  paused: 'badge-warning',
  deleting: 'badge-danger',
}

function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return dateFormatter.format(date)
}

function App() {
  const session = useSession()
  const authenticated = Boolean(session.actor) && !session.challengeId
  const { tenants, status, error, refresh } = useTenants({ enabled: authenticated })
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const [form, setForm] = useState({
    tenantId: '',
    name: '',
    host: '',
    supportEmail: '',
    headlessBaseUrl: '',
    apiKey: generateApiKey(),
    actorRoles: 'TENANT_ADMIN',
    clientBaseUrl: '',
    landingPath: '/overview',
    googleClientIdRef: '',
    googleClientSecretRef: '',
    googleRedirectUris: '',
    premiumDeployment: false,
  })

  const metrics = useMemo(() => {
    const total = tenants.length
    const active = tenants.filter((tenant) => tenant.status === 'active').length
    const premium = tenants.filter((tenant) => tenant.premiumDeployment).length
    const paused = tenants.filter((tenant) => tenant.status === 'paused').length
    return { total, active, premium, paused }
  }, [tenants])

  const filteredTenants = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return tenants
    }
    return tenants.filter((tenant) => {
      const haystack = [tenant.name, tenant.id, tenant.supportEmail, ...tenant.hosts]
      return haystack.some((value) => value.toLowerCase().includes(query))
    })
  }, [search, tenants])

  const isLoading = status === 'loading' && !tenants.length
  const statusMessage = status === 'loading' ? 'Syncing…' : status === 'error' ? 'Needs attention' : 'Up to date'

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(undefined)

    const actorRoles = form.actorRoles
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean)
    if (actorRoles.length === 0) {
      setCreateError('Provide at least one actor role')
      return
    }
    if (!form.tenantId || !form.name || !form.host || !form.supportEmail || !form.headlessBaseUrl || !form.clientBaseUrl) {
      setCreateError('Fill all required fields')
      return
    }

    setCreating(true)
    try {
      await createTenant({
        id: form.tenantId,
        name: form.name,
        hosts: [form.host],
        supportEmail: form.supportEmail,
        premiumDeployment: form.premiumDeployment,
        headless: {
          baseUrl: form.headlessBaseUrl,
          apiKeyRef: form.apiKey,
          tenantId: form.tenantId,
          actorRoles,
        },
        auth: {
          google: {
            clientIdRef: form.googleClientIdRef || 'set-me',
            clientSecretRef: form.googleClientSecretRef || 'set-me',
            redirectUris: form.googleRedirectUris
              ? form.googleRedirectUris.split(',').map((url) => url.trim()).filter(Boolean)
              : ['https://example.com/oauth/callback'],
          },
        },
        clientApp: {
          baseUrl: form.clientBaseUrl,
          landingPath: form.landingPath || '/overview',
        },
        branding: {},
        featureFlags: {},
        status: 'active',
      })

      setForm((prev) => ({
        ...prev,
        tenantId: '',
        name: '',
        host: '',
        supportEmail: '',
        headlessBaseUrl: '',
        apiKey: generateApiKey(),
        actorRoles: 'TENANT_ADMIN',
        clientBaseUrl: '',
        landingPath: '/overview',
        googleClientIdRef: '',
        googleClientSecretRef: '',
        googleRedirectUris: '',
      }))
      refresh()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unable to create tenant')
    } finally {
      setCreating(false)
    }
  }

  if (!authenticated) {
    return <AuthScreens />
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Super Admin • Control Plane</p>
          <h1>Tenant Registry</h1>
          <p className="subtitle">Connected to {controlPlaneApiBaseUrl}</p>
        </div>
        <div className="session-controls">
          <div className="user-chip">
            <span className="dot" />
            {session.actor?.username}
          </div>
          <button className="ghost" onClick={refresh} disabled={status === 'loading'}>
            Refresh
          </button>
          <button className="ghost" onClick={session.signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2>Onboard a Tenant</h2>
          <p className="subtitle">Creates a tenant in the registry and issues a control-plane API key.</p>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              <span>Tenant ID</span>
              <input value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required />
            </label>
            <label>
              <span>Tenant Name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              <span>Primary Host</span>
              <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
            </label>
            <label>
              <span>Support Email</span>
              <input
                type="email"
                value={form.supportEmail}
                onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                required
              />
            </label>
            <label>
              <span>Headless Base URL</span>
              <input
                value={form.headlessBaseUrl}
                onChange={(e) => setForm({ ...form, headlessBaseUrl: e.target.value })}
                placeholder="https://api.example.com"
                required
              />
            </label>
            <label>
              <span>Client App Base URL</span>
              <input
                value={form.clientBaseUrl}
                onChange={(e) => setForm({ ...form, clientBaseUrl: e.target.value })}
                placeholder="https://app.example.com"
                required
              />
            </label>
            <label>
              <span>Landing Path</span>
              <input
                value={form.landingPath}
                onChange={(e) => setForm({ ...form, landingPath: e.target.value })}
                placeholder="/overview"
              />
            </label>
            <label>
              <span>API Key</span>
              <div className="inline-field">
                <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required />
                <button type="button" className="ghost" onClick={() => setForm({ ...form, apiKey: generateApiKey() })}>
                  Regenerate
                </button>
              </div>
            </label>
            <label>
              <span>Actor Roles (comma separated)</span>
              <input value={form.actorRoles} onChange={(e) => setForm({ ...form, actorRoles: e.target.value })} />
            </label>
            <label>
              <span>Google Client ID Ref</span>
              <input
                value={form.googleClientIdRef}
                onChange={(e) => setForm({ ...form, googleClientIdRef: e.target.value })}
                placeholder="vault:client-id"
              />
            </label>
            <label>
              <span>Google Client Secret Ref</span>
              <input
                value={form.googleClientSecretRef}
                onChange={(e) => setForm({ ...form, googleClientSecretRef: e.target.value })}
                placeholder="vault:client-secret"
              />
            </label>
            <label>
              <span>Google Redirect URIs (comma)</span>
              <input
                value={form.googleRedirectUris}
                onChange={(e) => setForm({ ...form, googleRedirectUris: e.target.value })}
                placeholder="https://app.example.com/oauth/callback"
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.premiumDeployment}
                onChange={(e) => setForm({ ...form, premiumDeployment: e.target.checked })}
              />
              <span>Premium deployment</span>
            </label>

            {createError && <div className="callout error span-2">{createError}</div>}
            <div className="actions span-2">
              <button type="submit" className="primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create tenant'}
              </button>
              <button type="button" className="ghost" onClick={refresh}>
                Refresh list
              </button>
            </div>
          </form>
        </section>

        <section className="metrics-grid">
          <article>
            <p>Total Tenants</p>
            <strong>{metrics.total}</strong>
          </article>
          <article>
            <p>Active</p>
            <strong>{metrics.active}</strong>
          </article>
          <article>
            <p>Paused</p>
            <strong>{metrics.paused}</strong>
          </article>
          <article>
            <p>Premium Deployments</p>
            <strong>{metrics.premium}</strong>
          </article>
        </section>

        <section className="panel">
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search by name, id, or host"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="toolbar-meta">
              <span className={`status-dot ${status}`}></span>
              <span className="status-label">{statusMessage}</span>
            </div>
          </div>

          {error && <div className="callout error">{error}</div>}

          <div className="table-wrapper">
            {isLoading ? (
              <div className="placeholder">Loading tenant registry…</div>
            ) : filteredTenants.length === 0 ? (
              <div className="placeholder">No tenants match that search.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Status</th>
                    <th>Hosts</th>
                    <th>Support Email</th>
                    <th>Premium</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTenants.map((tenant) => (
                    <tr key={tenant.id}>
                      <td>
                        <p className="tenant-name">{tenant.name}</p>
                        <p className="tenant-id">{tenant.id}</p>
                      </td>
                      <td>
                        <span className={`status-badge ${statusClass[tenant.status] ?? 'badge-neutral'}`}>
                          {statusLabels[tenant.status] ?? tenant.status}
                        </span>
                      </td>
                      <td>
                        <ul className="host-list">
                          {tenant.hosts.map((host) => (
                            <li key={host}>{host}</li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <a href={`mailto:${tenant.supportEmail}`} className="support-email">
                          {tenant.supportEmail}
                        </a>
                      </td>
                      <td>{tenant.premiumDeployment ? 'Yes' : 'No'}</td>
                      <td>
                        <p>{formatUpdatedAt(tenant.updatedAt)}</p>
                        <p className="updated-by">by {tenant.updatedBy}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
