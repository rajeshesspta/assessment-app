const DEFAULT_BASE_URL = 'http://localhost:4700/api'

const envBaseUrl = import.meta.env.VITE_CONTROL_PLANE_API_BASE_URL

const normalizedBaseUrl = (envBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')

export const controlPlaneApiBaseUrl = normalizedBaseUrl.length ? normalizedBaseUrl : DEFAULT_BASE_URL
