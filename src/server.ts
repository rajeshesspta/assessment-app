import { buildApp } from './app.js';
import { initApiKeyStore } from './modules/auth/api-key.store.js';

const start = async () => {
  const app = buildApp();
  const port = Number(process.env.PORT || 3000);
  try {
    await initApiKeyStore();
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info({ port }, 'Server started');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
