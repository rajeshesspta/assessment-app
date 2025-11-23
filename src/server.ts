import { buildApp } from './app.js';
import { loadConfig } from './config/index.js';
import { createRepositoryBundleFromConfig } from './infrastructure/repositories.js';
import { initApiKeyStore } from './modules/auth/api-key.store.js';

const start = async () => {
  const config = loadConfig();
  const repositories = createRepositoryBundleFromConfig(config);
  const app = buildApp({ repositories });
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
