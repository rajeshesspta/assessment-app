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
    google: z.object({
      clientIdRef: z.string(),
      clientSecretRef: z.string(),
      redirectUris: z.array(z.string().url()).min(1),
    }),
  }),
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

async function requestJson(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json')
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

  return response.json()
}

export async function listTenants(signal?: AbortSignal): Promise<TenantRecord[]> {
  const payload = await requestJson('/control/tenants', { signal })
  const tenants = tenantListSchema.parse(payload)
  return tenants.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
