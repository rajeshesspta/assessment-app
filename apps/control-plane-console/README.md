# Control Plane Console

React + Vite dashboard for the Super Admin workflow. The console reads tenant metadata from the Control Plane API via the proxy service so the browser never sees the upstream API key.

## Prerequisites

1. Run the Control Plane API locally (see `apps/control-plane-api/README.md`) and capture its `CONTROL_PLANE_API_KEY`.
2. Start the proxy (`apps/control-plane-console-proxy`) with the same API key. The proxy enforces Basic Auth and forwards `/api/*` calls to the API while injecting `x-control-plane-key`.

```bash
npm run dev --workspace control-plane-console-proxy
```

3. Create `apps/control-plane-console/.env` based on `.env.example` and point it at the proxy:

```dotenv
VITE_CONTROL_PLANE_API_BASE_URL=http://localhost:4700/api
```

## Local development

Start Vite in watch mode:

```bash
npm run dev --workspace control-plane-console
```

Open the printed URL (default `http://localhost:5173`). The console shows live tenant data, basic metrics, and status indicators sourced from `/control/tenants`.

## Build

```bash
npm run build --workspace control-plane-console
```

Vite outputs the static bundle to `dist/`. Deploy it behind the proxy (or any backend) that can supply the same `/api` surface; the console relies on the `VITE_CONTROL_PLANE_API_BASE_URL` env at build time.
