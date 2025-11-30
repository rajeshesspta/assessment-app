# Consumer Portal

Tenant-facing learner portal that drives the headless Fastify assessment APIs. The goal is to exercise the public surface area a customer-facing application would call: configure tenant headers, fetch analytics, and launch attempts as a learner.

## Quick start

```bash
npm install
npm run dev --workspace consumer-bff   # boots http://127.0.0.1:4000
npm run dev --workspace consumer-portal
```

Then open `http://localhost:5175` (configurable via `VITE_PORT`/`VITE_HOST`). The dev server proxies `/api/*` calls to your consumer BFF (default `http://127.0.0.1:4000`). In the session banner, leave the base URL as `/api` (works with the proxy) or enter a fully-qualified BFF URL, provide the learner id, and optionally tweak the actor roles header. Secrets stay in the BFF `.env`; the portal only persists non-sensitive context in `localStorage`. Once saved you can:

1. Look up assessment analytics via `GET /analytics/assessments/:id`.
2. Kick off new attempts via `POST /attempts` (learner role enforced).
3. Refresh attempt status via `GET /attempts/:id`.

The UI persists session details in `localStorage` to streamline demos.

> Tip: copy `.env.example` to `.env.local` when you need to override `VITE_HOST`, `VITE_PORT`, or point the proxy at a remote BFF.

## Environment

| Env var          | Description                                                                                      | Default                 |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| `VITE_HOST`      | Host the Vite dev server binds to (use `0.0.0.0` to allow LAN access).                           | `0.0.0.0`               |
| `VITE_PORT`      | Dev server port.                                                                                 | `6000`                  |
| `VITE_PROXY_API` | Proxy target for `/api` requests during dev. Defaults to `http://127.0.0.1:4000` (consumer BFF). | `http://127.0.0.1:4000` |

## Architecture
