import { useCallback, useEffect, useState } from 'react'
import { listTenants, type TenantRecord } from '../api/controlPlaneClient'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface TenantState {
  tenants: TenantRecord[]
  status: Status
  error?: string
  refresh: () => void
}

interface Options {
  enabled?: boolean
}

export function useTenants(options?: Options): TenantState {
  const [tenants, setTenants] = useState<TenantRecord[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string>()
  const enabled = options?.enabled ?? true

  const loadTenants = useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled) {
        return
      }
      setStatus('loading')
      setError(undefined)
      try {
        const data = await listTenants(signal)
        setTenants(data)
        setStatus('success')
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') {
          return
        }
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    },
    [enabled],
  )

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setTenants([])
      setError(undefined)
      return
    }
    const controller = new AbortController()
    loadTenants(controller.signal)
    return () => controller.abort()
  }, [enabled, loadTenants])

  const refresh = useCallback(() => {
    if (!enabled) {
      return
    }
    loadTenants()
  }, [enabled, loadTenants])

  return { tenants, status, error, refresh }
}
