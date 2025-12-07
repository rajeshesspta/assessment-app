import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { controlPlaneApiBaseUrl } from './config'
import { useTenants } from './hooks/useTenants'
import { useSession } from './context/session-context'
import { AuthScreens } from './components/AuthGate'
import { createTenant, type CreateTenantRequest } from './api/controlPlaneClient'

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

type DeploymentType = 'shared' | 'premium'
type SocialProviderKey = 'google' | 'microsoft'

type SocialProviderForm = {
  enabled: boolean
  clientIdRef: string
  clientSecretRef: string
  redirectUris: string
}

const providerLabels: Record<SocialProviderKey, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
}

function createSocialProviderForm(enabled: boolean): SocialProviderForm {
  return {
    enabled,
    clientIdRef: '',
    clientSecretRef: '',
    redirectUris: '',
  }
}

function parseRedirects(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
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
  const [activePage, setActivePage] = useState<'dashboard' | 'tenants' | 'create'>('dashboard')
  const { tenants, status, error, refresh } = useTenants({ enabled: authenticated })
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const [form, setForm] = useState({
    name: '',
    host: '',
    supportEmail: '',
    headlessBaseUrl: '',
    apiKey: generateApiKey(),
    clientBaseUrl: '',
    landingPath: '/overview',
    deploymentType: 'shared' as DeploymentType,
    google: createSocialProviderForm(false),
    microsoft: createSocialProviderForm(false),
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const handler = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateError(undefined)

    const actorRoles = [session.actor?.username ?? 'system']
    if (!form.name || !form.host || !form.supportEmail || !form.headlessBaseUrl || !form.clientBaseUrl) {
      setCreateError('Fill all required fields')
      return
    }

    const providerKeys: SocialProviderKey[] = ['google', 'microsoft']
    const enabledProviders = providerKeys.filter((key) => form[key].enabled)

    const authPayload: CreateTenantRequest['auth'] = {}
    for (const key of enabledProviders) {
      const provider = form[key]
      if (!provider.clientIdRef || !provider.clientSecretRef) {
        setCreateError(`${providerLabels[key]} credentials are required`)
        return
      }
      const redirects = parseRedirects(provider.redirectUris)
      if (redirects.length === 0) {
        setCreateError(`${providerLabels[key]} redirect URIs are required`)
        return
      }
      authPayload[key] = {
        enabled: true,
        clientIdRef: provider.clientIdRef,
        clientSecretRef: provider.clientSecretRef,
        redirectUris: redirects,
      }
    }

    setCreating(true)
    try {
      const tenantPayload: any = {
        name: form.name,
        hosts: [form.host],
        supportEmail: form.supportEmail,
        premiumDeployment: form.deploymentType === 'premium',
        headless: {
          baseUrl: form.headlessBaseUrl,
          apiKeyRef: form.apiKey,
          actorRoles,
        },
        clientApp: {
          baseUrl: form.clientBaseUrl,
          landingPath: form.landingPath || '/overview',
        },
        branding: {},
        featureFlags: {},
        status: 'active',
      }

      if (Object.keys(authPayload).length > 0) {
        tenantPayload.auth = authPayload
      }

      await createTenant(tenantPayload)

      setForm({
        name: '',
        host: '',
        supportEmail: '',
        headlessBaseUrl: '',
        apiKey: generateApiKey(),
        clientBaseUrl: '',
        landingPath: '/overview',
        deploymentType: 'shared',
        google: createSocialProviderForm(true),
        microsoft: createSocialProviderForm(false),
      })
      refresh()
      setActivePage('tenants')
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
          <div className="nav-buttons" ref={dropdownRef}>
            <button className="ghost" type="button" onClick={() => setMenuOpen((value) => !value)}>
              Manage tenants <span className={`chevron ${menuOpen ? 'open' : ''}`}>▾</span>
            </button>
            {menuOpen && (
              <div className="dropdown-menu">
                <button
                  type="button"
                  className={activePage === 'dashboard' ? 'active' : ''}
                  onClick={() => {
                    setActivePage('dashboard')
                    setMenuOpen(false)
                    refresh()
                  }}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  className={activePage === 'tenants' ? 'active' : ''}
                  onClick={() => {
                    setActivePage('tenants')
                    setMenuOpen(false)
                    refresh()
                  }}
                >
                  Tenant list
                </button>
                <button
                  type="button"
                  className={activePage === 'create' ? 'active' : ''}
                  onClick={() => {
                    setActivePage('create')
                    setMenuOpen(false)
                  }}
                >
                  Create tenant
                </button>
              </div>
            )}
          </div>
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
        {activePage === 'dashboard' && (
          <>
            <section className="panel dashboard-hero">
              <div>
                <h2>Control Plane Overview</h2>
                <p className="subtitle">Monitor rollout velocity, cohort health, and premium coverage.</p>
              </div>
              <div className="hero-actions">
                <div className="status-chip">
                  <span className={`status-dot ${status}`}></span>
                  <span className="status-label">{statusMessage}</span>
                </div>
                <button className="ghost" type="button" onClick={() => setActivePage('tenants')}>
                  View tenant list
                </button>
              </div>
            </section>

            <section className="metrics-grid dashboard-metrics">
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
          </>
        )}

        {activePage === 'tenants' && (
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
        )}

        {activePage === 'create' && (
          <section className="panel narrow-panel">
            <h2>Onboard a Tenant</h2>
            <p className="subtitle">Create registry entry and issue a control-plane key.</p>
            <form className="form-grid" onSubmit={handleCreate}>
              <label>
                <span>
                  Tenant Name
                  <span className="hint-icon" tabIndex={0} data-tooltip={"A friendly tenant name shown in admin lists (e.g., 'Acme Learning')."} aria-label="Tenant name hint">ℹ</span>
                </span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                <span>
                  Deployment Type
                  <span className="hint-icon" tabIndex={0} data-tooltip={"Choose shared for standard tenants or premium to enable extra features."} aria-label="Deployment type hint">ℹ</span>
                </span>
                <select
                  value={form.deploymentType}
                  onChange={(e) => setForm({ ...form, deploymentType: e.target.value as DeploymentType })}
                >
                  <option value="shared">Shared</option>
                  <option value="premium">Premium</option>
                </select>
              </label>
              <label>
                <span>
                  Primary Host
                  <span className="hint-icon" tabIndex={0} data-tooltip={"Canonical hostname that routes browser traffic to this tenant (e.g., acme.learn.example.com). No protocol."} aria-label="Primary host hint">ℹ</span>
                </span>
                <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required />
              </label>
              <label>
                <span>
                  Support Email
                  <span className="hint-icon" tabIndex={0} data-tooltip={"Contact email shown on tenant pages and used for admin notifications."} aria-label="Support email hint">ℹ</span>
                </span>
                <input
                  type="email"
                  value={form.supportEmail}
                  onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                  required
                />
              </label>
              <div className="form-row span-2">
                <label>
                  <span>
                    Headless Base URL
                    <span className="hint-icon" tabIndex={0} data-tooltip={"The backend/API origin used for tenant-specific operations (include https://)."} aria-label="Headless base URL hint">ℹ</span>
                  </span>
                  <input
                    value={form.headlessBaseUrl}
                    onChange={(e) => setForm({ ...form, headlessBaseUrl: e.target.value })}
                    placeholder="https://api.example.com"
                    required
                  />
                </label>
                <label>
                  <span>
                    Headless API Key
                    <span className="hint-icon" tabIndex={0} data-tooltip={"Secret credential used by platform services to authenticate to this tenant's headless API. Rotate if compromised."} aria-label="Headless API Key hint">ℹ</span>
                  </span>
                  <div className="inline-field">
                    <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required />
                    <button type="button" className="ghost" onClick={() => setForm({ ...form, apiKey: generateApiKey() })}>
                      Regenerate
                    </button>
                  </div>
                </label>
              </div>

              <label>
                <span>
                  Client App Base URL
                  <span className="hint-icon" tabIndex={0} data-tooltip={"Public origin for the tenant's UI. Used for redirects and published links (include https://)."} aria-label="Client App Base URL hint">ℹ</span>
                </span>
                <input
                  value={form.clientBaseUrl}
                  onChange={(e) => setForm({ ...form, clientBaseUrl: e.target.value })}
                  placeholder="https://app.example.com"
                  required
                />
              </label>
              <label>
                <span>
                  Landing Path
                  <span className="hint-icon" tabIndex={0} data-tooltip={"Path the portal will open to after login (e.g., /overview). Starts with '/'."} aria-label="Landing path hint">ℹ</span>
                </span>
                <input
                  value={form.landingPath}
                  onChange={(e) => setForm({ ...form, landingPath: e.target.value })}
                  placeholder="/overview"
                />
              </label>
              
              {/* Social IDP configuration moved out of the create flow. */}
              {session.actor?.username === 'super-admin' ? (
                <div className="callout span-2">
                  Social identity providers and advanced tenant settings are configurable in the Tenant Settings page (Super Admin only).
                </div>
              ) : (
                <div className="callout span-2">
                  Social identity providers and advanced tenant settings can be configured later by a Super Admin.
                </div>
              )}

              {createError && <div className="callout error span-2">{createError}</div>}
              <div className="actions span-2">
                <button type="submit" className="primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create tenant'}
                </button>
                <button type="button" className="ghost" onClick={() => setActivePage('dashboard')}>
                  Back to dashboard
                </button>
              </div>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
