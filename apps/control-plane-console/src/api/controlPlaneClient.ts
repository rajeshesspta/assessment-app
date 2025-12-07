import { z } from 'zod'
import { controlPlaneApiBaseUrl } from '../config'

const brandingSchema = z
  .object({
    logoUrl: z.string().url().optional(),
    faviconUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#?[0-9a-fA-F]{3,8}$/).optional(),
    accentColor: z.string().regex(/^#?[0-9a-fA-F]{3,8}$/).optional(),
    backgroundImageUrl: z.string().url().optional(),
  })
  .default({})

const socialProviderSchema = z.object({
  enabled: z.boolean().optional(),
  clientIdRef: z.string(),
  clientSecretRef: z.string(),
  redirectUris: z.array(z.string().url()).min(1),
})

const tenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  hosts: z.array(z.string().min(1)).min(1),
  supportEmail: z.string().email(),
  premiumDeployment: z.boolean(),
  headless: z.object({
    baseUrl: z.string().url(),
    apiKeyRef: z.string(),
    tenantId: z.string(),
    actorRoles: z.array(z.string().min(1)).min(1),
  }),
  auth: z.object({
    google: socialProviderSchema.optional(),
    microsoft: socialProviderSchema.optional(),
  }).optional(),
  clientApp: z.object({
    baseUrl: z.string().url(),
    landingPath: z.string().min(1),
  }),
  branding: brandingSchema,
  featureFlags: z.record(z.boolean()).default({}),
  status: z.enum(['active', 'paused', 'deleting']),
  updatedAt: z.string(),
  updatedBy: z.string(),
})

const tenantListSchema = z.array(tenantSchema)

export type TenantRecord = z.infer<typeof tenantSchema>
export type CreateTenantRequest = {
  name: string
  hosts: string[]
  supportEmail: string
  premiumDeployment?: boolean
  headless: {
    baseUrl: string
    apiKeyRef: string
    actorRoles: string[]
  }
  auth?: {
    google?: {
      enabled?: boolean
      clientIdRef: string
      clientSecretRef: string
      redirectUris: string[]
    }
    microsoft?: {
      enabled?: boolean
      clientIdRef: string
      clientSecretRef: string
      redirectUris: string[]
    }
  }
  clientApp: {
    baseUrl: string
    landingPath: string
  }
  branding?: {
    logoUrl?: string
    faviconUrl?: string
    primaryColor?: string
    accentColor?: string
    backgroundImageUrl?: string
  }
  featureFlags?: Record<string, boolean>
  status?: 'active' | 'paused' | 'deleting'
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json')
  }
  if (!headers.has('content-type') && init?.body) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(`${controlPlaneApiBaseUrl}${path}`, {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers,
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Request failed (${response.status}): ${details || response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function listTenants(signal?: AbortSignal): Promise<TenantRecord[]> {
  const payload = await requestJson('/control/tenants', { signal })
  const tenants = tenantListSchema.parse(payload)
  return tenants.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

const sessionSchema = z.object({
  actor: z.object({ username: z.string() }),
  expiresAt: z.string().datetime(),
})

type SessionInfo = z.infer<typeof sessionSchema>

export async function login(username: string, password: string) {
  return requestJson<{ challengeId: string; expiresAt: string; delivery: string; devOtp?: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function verifyOtp(challengeId: string, otp: string) {
  return requestJson<SessionInfo>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ challengeId, otp }),
  })
}

export async function logout() {
  await requestJson('/auth/logout', { method: 'POST' })
}

export async function fetchSession(): Promise<SessionInfo | null> {
  try {
    const data = await requestJson<SessionInfo>('/auth/session')
    return sessionSchema.parse(data)
  } catch (error) {
    if (error instanceof Error && error.message.includes('(401)')) {
      return null
    }
    throw error
  }
}

export async function createTenant(payload: CreateTenantRequest) {
  // Avoid sending an empty `auth` object. Clean the payload server-side expects
  const bodyObj: any = { ...payload }
  if (!bodyObj.auth || Object.keys(bodyObj.auth).length === 0) {
    delete bodyObj.auth
  } else {
    // Remove any provider entries that are empty/undefined
    for (const k of ['google', 'microsoft']) {
      if (!bodyObj.auth[k] || Object.keys(bodyObj.auth[k]).length === 0) {
        delete bodyObj.auth[k]
      }
    }
    if (Object.keys(bodyObj.auth || {}).length === 0) {
      delete bodyObj.auth
    }
  }

  const body = JSON.stringify(bodyObj)
  const record = await requestJson<TenantRecord>('/control/tenants', { method: 'POST', body })
  return tenantSchema.parse(record)
}

export async function getTenant(id: string) {
  const record = await requestJson<TenantRecord>(`/control/tenants/${id}`);
  return tenantSchema.parse(record);
}

export async function updateTenantAuth(tenantId: string, authPayload: CreateTenantRequest['auth']) {
  const body = JSON.stringify(authPayload ?? {});
  const record = await requestJson<TenantRecord>(`/control/tenants/${tenantId}/auth`, { method: 'PUT', body });
  return tenantSchema.parse(record);
}
