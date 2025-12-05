import { useCallback, useEffect, useState } from 'react'
import { listTenants, type TenantRecord } from '../api/controlPlaneClient'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface TenantState {
  tenants: TenantRecord[]
  status: Status
  error?: string
  refresh: () => void
}

export function useTenants(): TenantState {
  const [tenants, setTenants] = useState<TenantRecord[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string>()

  const loadTenants = useCallback(
    async (signal?: AbortSignal) => {
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
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    loadTenants(controller.signal)
    return () => controller.abort()
  }, [loadTenants])

  const refresh = useCallback(() => {
    loadTenants()
  }, [loadTenants])

  return { tenants, status, error, refresh }
}
