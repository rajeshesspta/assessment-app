import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyPortalTheme,
  getStoredPortalTheme,
  PORTAL_THEMES,
  setStoredPortalTheme,
  type PortalThemeId,
} from '../theme/portalTheme';

export function usePortalTheme() {
  const [themeId, setThemeId] = useState<PortalThemeId>(() => getStoredPortalTheme());

  useEffect(() => {
    applyPortalTheme(themeId);
    setStoredPortalTheme(themeId);
  }, [themeId]);

  const options = useMemo(() => PORTAL_THEMES.map(theme => ({ id: theme.id, label: theme.label })), []);

  const setTheme = useCallback((next: PortalThemeId) => {
    setThemeId(next);
  }, []);

  return { themeId, setTheme, options };
}
