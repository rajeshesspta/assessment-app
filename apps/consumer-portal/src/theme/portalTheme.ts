export type PortalThemeId =
  | 'tenant'
  | 'indigo'
  | 'emerald'
  | 'rose'
  | 'slate'
  | 'sunset'
  | 'ocean'
  | 'aurora';

export const PORTAL_THEME_STORAGE_KEY = 'consumer-portal.theme';

type ThemeDefinition = {
  id: PortalThemeId;
  label: string;
  kind: 'tenant' | 'preset';
};

export const PORTAL_THEMES: ThemeDefinition[] = [
  { id: 'tenant', label: 'Tenant (branding)', kind: 'tenant' },
  { id: 'indigo', label: 'Indigo', kind: 'preset' },
  { id: 'emerald', label: 'Emerald', kind: 'preset' },
  { id: 'rose', label: 'Rose', kind: 'preset' },
  { id: 'slate', label: 'Slate', kind: 'preset' },
  { id: 'sunset', label: 'Sunset', kind: 'preset' },
  { id: 'ocean', label: 'Ocean', kind: 'preset' },
  { id: 'aurora', label: 'Aurora', kind: 'preset' },
];

export function isPortalThemeId(value: string): value is PortalThemeId {
  return PORTAL_THEMES.some(theme => theme.id === value);
}

export function getStoredPortalTheme(): PortalThemeId {
  if (typeof window === 'undefined') {
    return 'sunset';
  }
  const stored = window.localStorage.getItem(PORTAL_THEME_STORAGE_KEY);
  if (stored && isPortalThemeId(stored)) {
    return stored;
  }
  return 'sunset';
}

export function setStoredPortalTheme(themeId: PortalThemeId) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(PORTAL_THEME_STORAGE_KEY, themeId);
}

function readCssVar(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = raw?.trim();
  return value || undefined;
}

export function applyPortalTheme(themeId: PortalThemeId) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.setAttribute('data-portal-theme', themeId);

  const presetVars: Record<Exclude<PortalThemeId, 'tenant'>, { primary: string; primaryHover: string; accent: string; ring: string }> = {
    indigo: { primary: '#4f46e5', primaryHover: '#4338ca', accent: '#6366f1', ring: 'rgba(99, 102, 241, 0.35)' },
    emerald: { primary: '#059669', primaryHover: '#047857', accent: '#14b8a6', ring: 'rgba(5, 150, 105, 0.35)' },
    rose: { primary: '#e11d48', primaryHover: '#be123c', accent: '#fb7185', ring: 'rgba(225, 29, 72, 0.30)' },
    slate: { primary: '#0f172a', primaryHover: '#111827', accent: '#334155', ring: 'rgba(51, 65, 85, 0.22)' },
    sunset: { primary: '#ea580c', primaryHover: '#c2410c', accent: '#f59e0b', ring: 'rgba(249, 115, 22, 0.28)' },
    ocean: { primary: '#0891b2', primaryHover: '#0e7490', accent: '#3b82f6', ring: 'rgba(14, 116, 144, 0.30)' },
    aurora: { primary: '#7c3aed', primaryHover: '#6d28d9', accent: '#06b6d4', ring: 'rgba(124, 58, 237, 0.30)' },
  };

  if (themeId === 'tenant') {
    const tenantPrimary = readCssVar('--tenant-brand-primary') ?? '#4f46e5';
    const tenantAccent = readCssVar('--tenant-brand-accent') ?? tenantPrimary;
    root.style.setProperty('--portal-primary', tenantPrimary);
    root.style.setProperty('--portal-primary-hover', tenantAccent);
    root.style.setProperty('--portal-accent', tenantAccent);
    root.style.setProperty('--portal-ring', 'rgba(99, 102, 241, 0.35)');
    return;
  }

  const preset = presetVars[themeId];
  root.style.setProperty('--portal-primary', preset.primary);
  root.style.setProperty('--portal-primary-hover', preset.primaryHover);
  root.style.setProperty('--portal-accent', preset.accent);
  root.style.setProperty('--portal-ring', preset.ring);
}

export function initPortalTheme() {
  const theme = getStoredPortalTheme();
  applyPortalTheme(theme);
  return theme;
}
