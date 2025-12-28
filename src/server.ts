import { buildApp } from './app.js';
import { loadConfig } from './config/index.js';
import { createRepositoryBundleFromConfig } from './infrastructure/repositories.js';
import { initApiKeyStore } from './modules/auth/api-key.store.js';

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const start = async () => {
  console.log('Loading config...');
  const config = loadConfig();
  console.log('Creating repositories...');
  const repositories = createRepositoryBundleFromConfig(config);
  console.log('Building app...');
  const app = buildApp({ repositories });
  const port = Number(process.env.PORT || 3000);
  console.log('Initializing API key store...');
  await initApiKeyStore();
  console.log('Starting server...');
  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.log('Server started on port', port);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

start();
