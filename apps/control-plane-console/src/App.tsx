import { useMemo, useState } from 'react'
import './App.css'
import { controlPlaneApiBaseUrl } from './config'
import { useTenants } from './hooks/useTenants'

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
  const { tenants, status, error, refresh } = useTenants()
  const [search, setSearch] = useState('')

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Super Admin • Control Plane</p>
          <h1>Tenant Registry</h1>
          <p className="subtitle">Connected to {controlPlaneApiBaseUrl}</p>
        </div>
        <button className="ghost" onClick={refresh} disabled={status === 'loading'}>
          Refresh
        </button>
      </header>

      <main className="app-main">
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
