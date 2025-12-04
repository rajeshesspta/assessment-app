const RAW_BFF_BASE_URL = (import.meta.env.VITE_CONSUMER_BFF_URL ?? '').trim();
const NORMALIZED_BFF_BASE_URL = RAW_BFF_BASE_URL.endsWith('/')
  ? RAW_BFF_BASE_URL.slice(0, -1)
  : RAW_BFF_BASE_URL;

export function getBffBaseUrl() {
  return NORMALIZED_BFF_BASE_URL;
}

export function isBffEnabled() {
  return NORMALIZED_BFF_BASE_URL.length > 0;
}

export function buildBffUrl(path: string) {
  if (!isBffEnabled()) {
    throw new Error('Consumer BFF URL is not configured');
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${NORMALIZED_BFF_BASE_URL}${normalizedPath}`;
}
