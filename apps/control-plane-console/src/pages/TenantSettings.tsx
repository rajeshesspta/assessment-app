import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  getTenant,
  updateTenantAuth,
  updateTenantClientApp,
  updateTenantHeadless,
  updateTenantMeta,
  type TenantRecord,
  type UpdateTenantAuthPayload,
  type UpdateTenantHeadlessPayload,
} from '../api/controlPlaneClient'
import { useSession } from '../context/session-context'

type TabKey = 'meta' | 'identity' | 'persistence'
type ProviderKey = 'google' | 'microsoft'

type ProviderForm = {
  enabled: boolean
  clientIdRef: string
  clientSecretRef: string
  redirectUris: string
}

type BrandingFormState = {
  logoUrl: string
  faviconUrl: string
  primaryColor: string
  accentColor: string
  backgroundImageUrl: string
}

type MetaFormState = {
  name: string
  supportEmail: string
  hostsInput: string
  status: TenantRecord['status']
  deploymentType: 'shared' | 'premium'
  branding: BrandingFormState
  featureFlags: TenantRecord['featureFlags']
}

type DbProvider = 'sqlite' | 'cosmos'
type DbProviderOption = '' | DbProvider

type HeadlessFormState = {
  baseUrl: string
  apiKeyRef: string
  actorRolesInput: string
  dbProvider: DbProviderOption
  sqliteFilePath: string
  sqliteFilePattern: string
  cosmosConnectionStringRef: string
  cosmosDatabaseId: string
  cosmosContainerId: string
}

type ClientFormState = {
  baseUrl: string
  landingPath: string
}

const providerLabels: Record<ProviderKey, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
}

function parseRedirects(value = '') {
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseHostsInput(value: string) {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function parseActorRoles(value: string) {
  return value
    .split(/[,\n]/)
    .map((role) => role.trim().toUpperCase())
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

function createBrandingForm(source?: TenantRecord['branding']): BrandingFormState {
  return {
    logoUrl: source?.logoUrl ?? '',
    faviconUrl: source?.faviconUrl ?? '',
    primaryColor: source?.primaryColor ?? '',
    accentColor: source?.accentColor ?? '',
    backgroundImageUrl: source?.backgroundImageUrl ?? '',
  }
}

function deriveMetaForm(record?: TenantRecord | null): MetaFormState {
  return {
    name: record?.name ?? '',
    supportEmail: record?.supportEmail ?? '',
    hostsInput: record?.hosts?.join('\n') ?? '',
    status: record?.status ?? 'active',
    deploymentType: record?.premiumDeployment ? 'premium' : 'shared',
    branding: createBrandingForm(record?.branding),
    featureFlags: record?.featureFlags ?? {},
  }
}

function deriveHeadlessForm(record?: TenantRecord | null): HeadlessFormState {
  const db = record?.headless?.db
  let dbProvider: DbProviderOption = ''
  let sqliteFilePath = ''
  let sqliteFilePattern = ''
  let cosmosConnectionStringRef = ''
  let cosmosDatabaseId = ''
  let cosmosContainerId = ''

  if (db?.provider === 'sqlite') {
    dbProvider = 'sqlite'
    sqliteFilePath = db.filePath ?? ''
    sqliteFilePattern = db.filePattern ?? ''
  } else if (db?.provider === 'cosmos') {
    dbProvider = 'cosmos'
    cosmosConnectionStringRef = db.connectionStringRef ?? ''
    cosmosDatabaseId = db.databaseId ?? ''
    cosmosContainerId = db.containerId ?? ''
  }

  return {
    baseUrl: record?.headless?.baseUrl ?? '',
    apiKeyRef: record?.headless?.apiKeyRef ?? '',
    actorRolesInput: record?.headless?.actorRoles?.join(', ') ?? '',
    dbProvider,
    sqliteFilePath,
    sqliteFilePattern,
    cosmosConnectionStringRef,
    cosmosDatabaseId,
    cosmosContainerId,
  }
}

function deriveClientForm(record?: TenantRecord | null): ClientFormState {
  return {
    baseUrl: record?.clientApp?.baseUrl ?? '',
    landingPath: record?.clientApp?.landingPath ?? '/overview',
  }
}

function sanitizeBrandingInput(branding: BrandingFormState): TenantRecord['branding'] {
  const clean = Object.entries(branding).reduce<Record<string, string | undefined>>((acc, [key, value]) => {
    const trimmed = value.trim()
    acc[key] = trimmed.length > 0 ? trimmed : undefined
    return acc
  }, {})
  return clean as TenantRecord['branding']
}

function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value)
    return Boolean(parsed.protocol && parsed.host)
  } catch {
    return false
  }
}

interface TenantSettingsProps {
  tenantId: string | null
  tenant: TenantRecord | null
  onBack: () => void
}

export default function TenantSettings({ tenantId, tenant, onBack }: TenantSettingsProps) {
  const session = useSession()
  const [activeTab, setActiveTab] = useState<TabKey>('meta')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [metaForm, setMetaForm] = useState<MetaFormState>(() => deriveMetaForm(tenant))
  const [metaSaving, setMetaSaving] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaSuccess, setMetaSuccess] = useState<string | null>(null)
  const [headlessForm, setHeadlessForm] = useState<HeadlessFormState>(() => deriveHeadlessForm(tenant))
  const [headlessSaving, setHeadlessSaving] = useState(false)
  const [headlessError, setHeadlessError] = useState<string | null>(null)
  const [headlessSuccess, setHeadlessSuccess] = useState<string | null>(null)
  const [clientForm, setClientForm] = useState<ClientFormState>(() => deriveClientForm(tenant))
  const [clientSaving, setClientSaving] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [clientSuccess, setClientSuccess] = useState<string | null>(null)
  const [google, setGoogle] = useState<ProviderForm>(createEmptyProvider)
  const [microsoft, setMicrosoft] = useState<ProviderForm>(createEmptyProvider)
  const [googleSaving, setGoogleSaving] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [googleSuccess, setGoogleSuccess] = useState<string | null>(null)
  const [microsoftSaving, setMicrosoftSaving] = useState(false)
  const [microsoftError, setMicrosoftError] = useState<string | null>(null)
  const [microsoftSuccess, setMicrosoftSuccess] = useState<string | null>(null)

  const canManage = session.actor?.roles?.includes('SUPER_ADMIN') ?? false

  const syncForms = useCallback((record: TenantRecord) => {
    setMetaForm(deriveMetaForm(record))
    setHeadlessForm(deriveHeadlessForm(record))
    setClientForm(deriveClientForm(record))
    setGoogle(deriveProviderForm(record.auth?.google))
    setMicrosoft(deriveProviderForm(record.auth?.microsoft))
  }, [])

  const loadTenant = useCallback(
    async (id: string) => {
      setLoading(true)
      setLoadError(null)
      try {
        const t = await getTenant(id)
        syncForms(t)
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [syncForms],
  )

  useEffect(() => {
    if (!tenantId || !canManage) return
    void loadTenant(tenantId)
  }, [tenantId, canManage, loadTenant])

  useEffect(() => {
    if (!tenantId || !tenant || tenant.id !== tenantId) {
      return
    }
    syncForms(tenant)
  }, [tenant, tenantId, syncForms])

  useEffect(() => {
    if (tenantId) {
      setActiveTab('meta')
      setMetaSuccess(null)
      setMetaError(null)
      setHeadlessSuccess(null)
      setHeadlessError(null)
      setClientSuccess(null)
      setClientError(null)
      setGoogleSuccess(null)
      setGoogleError(null)
      setMicrosoftSuccess(null)
      setMicrosoftError(null)
    }
  }, [tenantId])

  if (!tenantId) {
    return null
  }

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

  const tenantLabel = tenant?.name ?? metaForm.name ?? tenantId

  const handleMetaSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMetaError(null)
    setMetaSuccess(null)
    const hosts = parseHostsInput(metaForm.hostsInput)
    if (hosts.length === 0) {
      setMetaError('Add at least one host before saving')
      return
    }
    if (!metaForm.supportEmail) {
      setMetaError('Support email is required')
      return
    }
    const payload = {
      name: metaForm.name.trim(),
      hosts,
      supportEmail: metaForm.supportEmail.trim(),
      premiumDeployment: metaForm.deploymentType === 'premium',
      status: metaForm.status,
      branding: sanitizeBrandingInput(metaForm.branding),
      featureFlags: metaForm.featureFlags ?? {},
    }
    setMetaSaving(true)
    try {
      await updateTenantMeta(tenantId, payload)
      await loadTenant(tenantId)
      setMetaSuccess('Metadata updated')
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : String(err))
    } finally {
      setMetaSaving(false)
    }
  }

  const handleProviderSubmit = async (event: FormEvent<HTMLFormElement>, provider: ProviderKey) => {
    event.preventDefault()
    const state = provider === 'google' ? google : microsoft
    const setError = provider === 'google' ? setGoogleError : setMicrosoftError
    const setSuccess = provider === 'google' ? setGoogleSuccess : setMicrosoftSuccess
    const setSaving = provider === 'google' ? setGoogleSaving : setMicrosoftSaving
    setError(null)
    setSuccess(null)

    const payload: UpdateTenantAuthPayload = {}
    if (state.enabled) {
      const redirects = parseRedirects(state.redirectUris)
      if (!state.clientIdRef || !state.clientSecretRef || redirects.length === 0) {
        setError(`${providerLabels[provider]} configuration incomplete`)
        return
      }
      payload[provider] = {
        clientIdRef: state.clientIdRef.trim(),
        clientSecretRef: state.clientSecretRef.trim(),
        redirectUris: redirects,
      }
    } else {
      payload[provider] = null
    }

    setSaving(true)
    try {
      await updateTenantAuth(tenantId, payload)
      await loadTenant(tenantId)
      setSuccess(`${providerLabels[provider]} settings saved`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleHeadlessSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setHeadlessError(null)
    setHeadlessSuccess(null)
    const baseUrl = headlessForm.baseUrl.trim()
    if (!isValidUrl(baseUrl)) {
      setHeadlessError('Enter a valid base URL (include https://) before saving')
      return
    }
    const actorRoles = parseActorRoles(headlessForm.actorRolesInput)
    if (actorRoles.length === 0) {
      setHeadlessError('Provide at least one actor role')
      return
    }
    let dbPayload: UpdateTenantHeadlessPayload['db'] | null | undefined
    if (headlessForm.dbProvider === '') {
      dbPayload = null
    } else if (headlessForm.dbProvider === 'sqlite') {
      const filePath = headlessForm.sqliteFilePath.trim()
      const filePattern = headlessForm.sqliteFilePattern.trim()
      if (!filePath && !filePattern) {
        setHeadlessError('Provide a SQLite file path or pattern')
        return
      }
      dbPayload = {
        provider: 'sqlite',
        ...(filePath ? { filePath } : {}),
        ...(filePattern ? { filePattern } : {}),
      }
    } else if (headlessForm.dbProvider === 'cosmos') {
      const connectionStringRef = headlessForm.cosmosConnectionStringRef.trim()
      const databaseId = headlessForm.cosmosDatabaseId.trim()
      const containerId = headlessForm.cosmosContainerId.trim()
      if (!connectionStringRef || !databaseId || !containerId) {
        setHeadlessError('Fill all Cosmos DB fields before saving')
        return
      }
      dbPayload = {
        provider: 'cosmos',
        connectionStringRef,
        databaseId,
        containerId,
      }
    }
    const payload: UpdateTenantHeadlessPayload = {
      baseUrl,
      apiKeyRef: headlessForm.apiKeyRef.trim(),
      actorRoles,
    }
    if (dbPayload !== undefined) {
      payload.db = dbPayload
    }
    setHeadlessSaving(true)
    try {
      await updateTenantHeadless(tenantId, payload)
      await loadTenant(tenantId)
      setHeadlessSuccess('Headless access saved')
    } catch (err) {
      setHeadlessError(err instanceof Error ? err.message : String(err))
    } finally {
      setHeadlessSaving(false)
    }
  }

  const handleClientSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setClientError(null)
    setClientSuccess(null)
    const baseUrl = clientForm.baseUrl.trim()
    if (!baseUrl) {
      setClientError('Client base URL is required')
      return
    }
    if (!isValidUrl(baseUrl)) {
      setClientError('Enter a valid client base URL (include https://)')
      return
    }
    const payload = {
      baseUrl,
      landingPath: clientForm.landingPath.trim() || '/overview',
    }
    setClientSaving(true)
    try {
      await updateTenantClientApp(tenantId, payload)
      await loadTenant(tenantId)
      setClientSuccess('Client app saved')
    } catch (err) {
      setClientError(err instanceof Error ? err.message : String(err))
    } finally {
      setClientSaving(false)
    }
  }

  return (
    <section className="panel tenant-settings-panel">
      <div className="panel-header">
        <div>
          <h2>Tenant Settings</h2>
          <p className="subtitle">
            Editing <strong>{tenantLabel}</strong> ({tenantId})
          </p>
        </div>
        <button className="ghost" onClick={onBack}>
          Back
        </button>
      </div>
      {loadError && <div className="callout error">{loadError}</div>}
      {loading && <div className="callout info">Loading tenant settings…</div>}

      <div className="tab-shell">
        <div className="tab-list">
          <button
            type="button"
            className={activeTab === 'meta' ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab('meta')}
          >
            Meta &amp; Status
          </button>
          <button
            type="button"
            className={activeTab === 'identity' ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab('identity')}
          >
            Identity Providers
          </button>
          <button
            type="button"
            className={activeTab === 'persistence' ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab('persistence')}
          >
            Persistence &amp; Access
          </button>
        </div>

        {activeTab === 'meta' && (
          <div className="tab-panel">
            <form className="form-stack" onSubmit={handleMetaSave}>
              <div className="form-card two-col">
                <label>
                  Tenant name
                  <input value={metaForm.name} onChange={(e) => setMetaForm({ ...metaForm, name: e.target.value })} required />
                </label>
                <label>
                  Support email
                  <input
                    type="email"
                    value={metaForm.supportEmail}
                    onChange={(e) => setMetaForm({ ...metaForm, supportEmail: e.target.value })}
                    required
                  />
                </label>
              </div>
              <div className="form-card">
                <label>
                  Hosts (one per line)
                  <textarea
                    className="textarea-field"
                    rows={4}
                    value={metaForm.hostsInput}
                    onChange={(e) => setMetaForm({ ...metaForm, hostsInput: e.target.value })}
                  />
                </label>
              </div>
              <div className="form-card two-col">
                <label>
                  Status
                  <select value={metaForm.status} onChange={(e) => setMetaForm({ ...metaForm, status: e.target.value as TenantRecord['status'] })}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="deleting">Deleting</option>
                  </select>
                </label>
                <label>
                  Deployment type
                  <select
                    value={metaForm.deploymentType}
                    onChange={(e) => setMetaForm({ ...metaForm, deploymentType: e.target.value as MetaFormState['deploymentType'] })}
                  >
                    <option value="shared">Shared</option>
                    <option value="premium">Premium</option>
                  </select>
                </label>
              </div>
              <div className="form-card">
                <h3>Branding</h3>
                <div className="form-grid">
                  <label>
                    Primary color
                    <input
                      value={metaForm.branding.primaryColor}
                      placeholder="#2244FF"
                      onChange={(e) => setMetaForm({ ...metaForm, branding: { ...metaForm.branding, primaryColor: e.target.value } })}
                    />
                  </label>
                  <label>
                    Accent color
                    <input
                      value={metaForm.branding.accentColor}
                      placeholder="#89CFF0"
                      onChange={(e) => setMetaForm({ ...metaForm, branding: { ...metaForm.branding, accentColor: e.target.value } })}
                    />
                  </label>
                  <label>
                    Logo URL
                    <input
                      value={metaForm.branding.logoUrl}
                      onChange={(e) => setMetaForm({ ...metaForm, branding: { ...metaForm.branding, logoUrl: e.target.value } })}
                    />
                  </label>
                  <label>
                    Favicon URL
                    <input
                      value={metaForm.branding.faviconUrl}
                      onChange={(e) => setMetaForm({ ...metaForm, branding: { ...metaForm.branding, faviconUrl: e.target.value } })}
                    />
                  </label>
                  <label className="span-2">
                    Background image URL
                    <input
                      value={metaForm.branding.backgroundImageUrl}
                      onChange={(e) => setMetaForm({ ...metaForm, branding: { ...metaForm.branding, backgroundImageUrl: e.target.value } })}
                    />
                  </label>
                </div>
              </div>
              <div className="form-card">
                <h3>Feature flags</h3>
                {Object.keys(metaForm.featureFlags ?? {}).length === 0 ? (
                  <p className="field-hint">No feature flags configured.</p>
                ) : (
                  <div className="pill-list">
                    {Object.entries(metaForm.featureFlags).map(([flag, enabled]) => (
                      <span key={flag} className={enabled ? 'pill success' : 'pill'}>
                        {flag} {enabled ? '• on' : '• off'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {metaError && <div className="callout error">{metaError}</div>}
              {metaSuccess && <div className="callout success">{metaSuccess}</div>}
              <div className="actions">
                <button type="submit" className="primary" disabled={metaSaving || loading}>
                  {metaSaving ? 'Saving…' : 'Save meta'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'identity' && (
          <div className="tab-panel">
            <div className="idp-grid">
              <form className="form-card" onSubmit={(event) => handleProviderSubmit(event, 'google')}>
                <div className="idp-toggle">
                  <label>
                    <input type="checkbox" checked={google.enabled} onChange={(e) => setGoogle({ ...google, enabled: e.target.checked })} /> Enable
                    {google.enabled ? 'Google is active' : 'Disable Google'}
                  </label>
                </div>
                <label>
                  Client ID ref
                  <input value={google.clientIdRef} onChange={(e) => setGoogle({ ...google, clientIdRef: e.target.value })} />
                </label>
                <label>
                  Client secret ref
                  <input value={google.clientSecretRef} onChange={(e) => setGoogle({ ...google, clientSecretRef: e.target.value })} />
                </label>
                <label>
                  Redirect URIs
                  <textarea
                    className="textarea-field"
                    rows={3}
                    value={google.redirectUris}
                    onChange={(e) => setGoogle({ ...google, redirectUris: e.target.value })}
                  />
                  <span className="field-hint">Comma or newline separated</span>
                </label>
                {googleError && <div className="callout error">{googleError}</div>}
                {googleSuccess && <div className="callout success">{googleSuccess}</div>}
                <div className="actions">
                  <button type="submit" className="primary" disabled={googleSaving || loading}>
                    {googleSaving ? 'Saving…' : 'Save Google'}
                  </button>
                </div>
              </form>

              <form className="form-card" onSubmit={(event) => handleProviderSubmit(event, 'microsoft')}>
                <div className="idp-toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={microsoft.enabled}
                      onChange={(e) => setMicrosoft({ ...microsoft, enabled: e.target.checked })}
                    />{' '}
                    Enable
                    {microsoft.enabled ? 'Microsoft is active' : 'Disable Microsoft'}
                  </label>
                </div>
                <label>
                  Client ID ref
                  <input value={microsoft.clientIdRef} onChange={(e) => setMicrosoft({ ...microsoft, clientIdRef: e.target.value })} />
                </label>
                <label>
                  Client secret ref
                  <input value={microsoft.clientSecretRef} onChange={(e) => setMicrosoft({ ...microsoft, clientSecretRef: e.target.value })} />
                </label>
                <label>
                  Redirect URIs
                  <textarea
                    className="textarea-field"
                    rows={3}
                    value={microsoft.redirectUris}
                    onChange={(e) => setMicrosoft({ ...microsoft, redirectUris: e.target.value })}
                  />
                  <span className="field-hint">Comma or newline separated</span>
                </label>
                {microsoftError && <div className="callout error">{microsoftError}</div>}
                {microsoftSuccess && <div className="callout success">{microsoftSuccess}</div>}
                <div className="actions">
                  <button type="submit" className="primary" disabled={microsoftSaving || loading}>
                    {microsoftSaving ? 'Saving…' : 'Save Microsoft'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'persistence' && (
          <div className="tab-panel">
            <form className="form-card" onSubmit={handleHeadlessSave}>
              <h3>Headless API access</h3>
              <label>
                Base URL
                <input
                  value={headlessForm.baseUrl}
                  onChange={(e) => setHeadlessForm({ ...headlessForm, baseUrl: e.target.value })}
                  required
                />
              </label>
              <label>
                API Key reference
                <div className="inline-field">
                  <input value={headlessForm.apiKeyRef} onChange={(e) => setHeadlessForm({ ...headlessForm, apiKeyRef: e.target.value })} />
                  <button type="button" className="ghost" onClick={() => setHeadlessForm({ ...headlessForm, apiKeyRef: generateApiKey() })}>
                    Rotate key
                  </button>
                </div>
              </label>
              <label>
                Allowed actor roles
                <textarea
                  className="textarea-field"
                  rows={3}
                  value={headlessForm.actorRolesInput}
                  onChange={(e) => setHeadlessForm({ ...headlessForm, actorRolesInput: e.target.value })}
                />
                <span className="field-hint">Comma separated list (e.g. TENANT_ADMIN, CONTENT_AUTHOR)</span>
              </label>
              <label>
                Database provider
                <select
                  value={headlessForm.dbProvider}
                  onChange={(e) => {
                    const next = e.target.value as DbProviderOption
                    setHeadlessForm((prev) => ({
                      ...prev,
                      dbProvider: next,
                      ...(next === 'sqlite'
                        ? {
                            cosmosConnectionStringRef: '',
                            cosmosDatabaseId: '',
                            cosmosContainerId: '',
                          }
                        : next === 'cosmos'
                        ? {
                            sqliteFilePath: '',
                            sqliteFilePattern: '',
                          }
                        : {
                            sqliteFilePath: '',
                            sqliteFilePattern: '',
                            cosmosConnectionStringRef: '',
                            cosmosDatabaseId: '',
                            cosmosContainerId: '',
                          }),
                    }))
                  }}
                >
                  <option value="">Platform default</option>
                  <option value="sqlite">SQLite (file-backed)</option>
                  <option value="cosmos">Azure Cosmos DB</option>
                </select>
                <span className="field-hint">Choose where tenant data persists. Defaults to the platform-wide storage.</span>
              </label>
              {headlessForm.dbProvider === 'sqlite' && (
                <div className="form-card">
                  <h4>SQLite options</h4>
                  <label>
                    File path (secret ref)
                    <input
                      value={headlessForm.sqliteFilePath}
                      onChange={(e) => setHeadlessForm({ ...headlessForm, sqliteFilePath: e.target.value })}
                      placeholder="kv://tenant-alpha/sqlite-path"
                    />
                  </label>
                  <label>
                    File pattern (optional)
                    <input
                      value={headlessForm.sqliteFilePattern}
                      onChange={(e) => setHeadlessForm({ ...headlessForm, sqliteFilePattern: e.target.value })}
                      placeholder="data/sqlite/{tenantId}.db"
                    />
                  </label>
                  <p className="field-hint">
                    Store only references; the runtime resolves refs into actual filesystem paths or secrets.
                  </p>
                </div>
              )}
              {headlessForm.dbProvider === 'cosmos' && (
                <div className="form-card">
                  <h4>Cosmos DB options</h4>
                  <label>
                    Connection string secret ref
                    <input
                      value={headlessForm.cosmosConnectionStringRef}
                      onChange={(e) => setHeadlessForm({ ...headlessForm, cosmosConnectionStringRef: e.target.value })}
                      placeholder="kv://tenant-alpha/cosmos-conn"
                    />
                  </label>
                  <label>
                    Database ID
                    <input
                      value={headlessForm.cosmosDatabaseId}
                      onChange={(e) => setHeadlessForm({ ...headlessForm, cosmosDatabaseId: e.target.value })}
                    />
                  </label>
                  <label>
                    Container ID
                    <input
                      value={headlessForm.cosmosContainerId}
                      onChange={(e) => setHeadlessForm({ ...headlessForm, cosmosContainerId: e.target.value })}
                    />
                  </label>
                  <p className="field-hint">
                    Follow Azure Cosmos DB guidance: keep refs in Key Vault, distribute data across partitions, and reuse a singleton client in the runtime.
                  </p>
                </div>
              )}
              {headlessError && <div className="callout error">{headlessError}</div>}
              {headlessSuccess && <div className="callout success">{headlessSuccess}</div>}
              <div className="actions">
                <button type="submit" className="primary" disabled={headlessSaving || loading}>
                  {headlessSaving ? 'Saving…' : 'Save API access'}
                </button>
              </div>
            </form>

            <form className="form-card" onSubmit={handleClientSave}>
              <h3>Client application</h3>
              <label>
                Base URL
                <input value={clientForm.baseUrl} onChange={(e) => setClientForm({ ...clientForm, baseUrl: e.target.value })} required />
              </label>
              <label>
                Default landing path
                <input
                  value={clientForm.landingPath}
                  onChange={(e) => setClientForm({ ...clientForm, landingPath: e.target.value })}
                  placeholder="/overview"
                />
              </label>
              {clientError && <div className="callout error">{clientError}</div>}
              {clientSuccess && <div className="callout success">{clientSuccess}</div>}
              <div className="actions">
                <button type="submit" className="primary" disabled={clientSaving || loading}>
                  {clientSaving ? 'Saving…' : 'Save client app'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </section>
  )
}
