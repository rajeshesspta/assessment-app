# Assessment Platform Developer Portal

Vite + React single-page app that surfaces onboarding docs, pulls the live OpenAPI spec, and embeds the Fastify Swagger UI served by the API.

## Commands

```bash
npm install          # run at repo root (workspaces enabled)
npm run dev:portal   # start portal at http://localhost:5173
npm run build:portal # produce static assets in apps/dev-portal/dist
npm run preview --workspace dev-portal
```

## Environment

- `VITE_API_BASE_URL` (default `http://localhost:3000`): base URL of the running API. Used for fetching `/docs/json`, embedding Swagger UI, and building sample curl commands.

## Notes

- During `npm run dev:portal` the Vite dev server proxies `/docs` to the API, so Swagger UI loads without extra CORS settings.
- The OpenAPI spec powers the endpoint highlight grid; when you extend the API, the portal reflects the new operations automatically.
