export type PortalThemeId = 'tenant' | 'indigo' | 'emerald' | 'rose' | 'slate' | 'sunset';

const STORAGE_KEY = 'portal.theme';
const DEFAULT_THEME: PortalThemeId = 'tenant';

export function getStoredPortalTheme(): PortalThemeId {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'tenant' || raw === 'indigo' || raw === 'emerald' || raw === 'rose' || raw === 'slate' || raw === 'sunset') {
    return raw;
  }
  return DEFAULT_THEME;
}

export function setStoredPortalTheme(theme: PortalThemeId) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function applyPortalTheme(theme: PortalThemeId) {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.dataset.portalTheme = theme;
  window.dispatchEvent(new CustomEvent('portal-theme-change', { detail: theme }));
}
