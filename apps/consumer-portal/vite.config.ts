import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_API === undefined
    ? 'http://127.0.0.1:4000'
    : env.VITE_PROXY_API;
  const normalizedProxyTarget = proxyTarget?.trim();
  const resolvedProxyTarget = normalizedProxyTarget && normalizedProxyTarget.length > 0
    ? normalizedProxyTarget
    : undefined;

  return {
    plugins: [react()],
    server: {
      port: Number(env.VITE_PORT ?? 6000),
      host: env.VITE_HOST ?? 'localhost',
      strictPort: false,
      proxy: resolvedProxyTarget ? {
        '/api': {
          target: resolvedProxyTarget,
          changeOrigin: true,
        },
      } : undefined,
    },
    preview: {
      port: Number(env.VITE_PORT ?? 4174),
      host: '127.0.0.1',
    },
    define: {
      __APP_VERSION__: JSON.stringify(env.npm_package_version ?? '0.0.0'),
    },
  };
});
