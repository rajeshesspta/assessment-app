# Control Plane Console Proxy

This service sits between the Control Plane Console (Vite frontend) and the Control Plane API. It enforces console authentication, injects the Control Plane API key, and forwards all `/api/*` requests to the upstream API.

## Setup

1. Install dependencies from the repo root:
   ```bash
   npm install
   ```
2. Copy the sample environment file and update secrets:
   ```bash
   cp apps/control-plane-console-proxy/.env.example apps/control-plane-console-proxy/.env
   ```
3. Edit `.env` with the following values:
   - `PORT`/`HOST`: Proxy listen address (defaults are fine for local dev).
   - `CONTROL_PLANE_BASE_URL`: Target API base URL, e.g. `http://localhost:4600`.
   - `CONTROL_PLANE_API_KEY`: Super Admin API key from the control plane service.
   - `CONSOLE_BASIC_USER` / `CONSOLE_BASIC_PASS`: Credentials the console must provide.

## Running locally

From the repo root run:

```bash
npm run dev --workspace control-plane-console-proxy
```

This starts Fastify with hot reload (`tsx watch`). The proxy exposes:

- `GET /healthz` – unauthenticated health check.
- `/api/*` – authenticated routes that enforce Basic Auth and forward requests to the control plane API while injecting the `x-control-plane-key` header.

Point the Control Plane Console at this proxy by setting its API base URL to `http://localhost:4700/api` (or wherever the proxy listens).

## Production notes

- Rotate `CONTROL_PLANE_API_KEY` via the control plane registry and update the proxy env when keys change.
- The Basic Auth guard is a placeholder until the console's real auth provider (OIDC) is wired up; keep credentials strong and rotate regularly.
- Deploy the proxy close to the console frontend to minimize latency, but never expose the upstream API key directly to the browser.
