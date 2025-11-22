import { buildApp } from './app.js';

const start = async () => {
  const app = buildApp();
  const port = Number(process.env.PORT || 3000);
  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info({ port }, 'Server started');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
