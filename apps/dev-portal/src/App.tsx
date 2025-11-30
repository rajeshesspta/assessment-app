import type { OpenAPIV3 } from 'openapi-types';
import { useMemo } from 'react';
import { useOpenApiSpec } from './hooks/useOpenApiSpec';
import { PostPlayground } from './components/PostPlayground';
import { generateExampleFromSchema, resolveRequestBody, resolveSchemaObject } from './utils/openapi';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const swaggerUiUrl = `${apiBaseUrl}/docs`;
const openApiJsonUrl = `${apiBaseUrl}/docs/json`;
const sampleCurl = `curl -X GET "${apiBaseUrl}/items" \\\n  -H "x-api-key: <tenant_or_super_admin_api_key>" \\\n  -H "x-tenant-id: <tenant_id>"`;

const quickstartSteps = [
  'Run npm run db:seed:init to bootstrap the system tenant and Super Admin.',
  'Provision a sandbox tenant via POST /tenants (x-tenant-id=sys-tenant) or the CLI tools.',
  'Seed items + assessments (npm run db:seed -- --tenant=<id>) so the API has data.',
  'Call the API with the issued API key + tenant header. Start with /items or /assessments.',
];

const resourceLinks = [
  { label: 'API Reference (Swagger)', href: swaggerUiUrl },
  { label: 'OpenAPI JSON', href: openApiJsonUrl },
  { label: 'Repository README', href: 'https://github.com/rajeshesspta/assessment-app' },
];

type AllowedMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
const methods: AllowedMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

export default function App() {
  const { spec, loading, error } = useOpenApiSpec(openApiJsonUrl);

  const { endpoints, postOperations } = useMemo(() => {
    if (!spec?.paths) {
      return { endpoints: [], postOperations: [] };
    }

    const entries = Object.entries(spec.paths)
      .flatMap(([path, item]) => {
        if (!item) return [];
        return methods
          .map(method => {
            const operation = item[method];
            if (!operation) return null;
            const op = operation as OpenAPIV3.OperationObject;
            return {
              method: method.toUpperCase(),
              path,
              summary: op.summary ?? op.description ?? 'No description provided',
            };
          })
          .filter(Boolean) as { method: string; path: string; summary: string }[];
      })
      .slice(0, 10);

    const posts = Object.entries(spec.paths)
      .flatMap(([path, item]) => {
        const operation = item?.post as OpenAPIV3.OperationObject | undefined;
        if (!operation) return [];
        const requestBody = resolveRequestBody(operation.requestBody as OpenAPIV3.RequestBodyObject | undefined, spec.components);
        const schema = requestBody?.content?.['application/json']?.schema;
        const resolvedSchema = resolveSchemaObject(schema, spec.components);
        const example = schema ? generateExampleFromSchema(schema, spec.components) : {};
        const prettyExample = JSON.stringify(example ?? {}, null, 2) ?? '{\n  \n}';
        const schemaString = resolvedSchema ? JSON.stringify(resolvedSchema, null, 2) : null;
        return [
          {
            id: `${path}-post`,
            path,
            summary: operation.summary ?? `POST ${path}`,
            description: operation.description,
            exampleBody: prettyExample,
            schema: schemaString,
          },
        ];
      })
      .slice(0, 3);

    return { endpoints: entries, postOperations: posts };
  }, [spec]);

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Assessment Platform · Developer Preview</p>
        <h1>Everything you need to build on the headless assessment APIs</h1>
        <p className="lead">
          Generate tenants, seed content, and ship assessment workflows with a few API calls. This
          portal centralizes the docs, quickstarts, and interactive explorer you need to get moving fast.
        </p>
        <div className="hero-actions">
          <a className="primary" href={swaggerUiUrl} target="_blank" rel="noreferrer">
            Open API Explorer
          </a>
          <a className="secondary" href="https://github.com/rajeshesspta/assessment-app#readme" target="_blank" rel="noreferrer">
            View Repo
          </a>
        </div>
      </header>

      <main>
        <section className="card">
          <h2>Quickstart</h2>
          <ol className="steps">
            {quickstartSteps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="card grid">
          <div>
            <h3>Sample Request</h3>
            <p>Use the issued API key + tenant header to scope every call.</p>
            <pre className="code-block">
              <code>{sampleCurl}</code>
            </pre>
          </div>
          <div>
            <h3>Sandbox Tenants</h3>
            <p>
              Need a playground tenant? Call <code>POST /sandbox/tenants</code> (coming soon) or use the existing CLI
              scripts to provision <code>tenant-demo</code> locally. Each sandbox ships with a seeded item bank and assessments.
            </p>
            <ul className="mini-list">
              <li><strong>Bootstrap:</strong> <code>npm run db:seed:init</code></li>
              <li><strong>Provision tenant:</strong> <code>npm run db:provision -- --tenant=tenant-demo</code></li>
              <li><strong>Seed data:</strong> <code>npm run db:seed -- --tenant=tenant-demo</code></li>
            </ul>
          </div>
        </section>

        <section className="card">
          <h2>Live Documentation</h2>
          <p>Swagger UI is served directly from the API so you are always looking at the latest contract.</p>
          <div className="iframe-wrapper">
            <iframe title="Swagger UI" src={swaggerUiUrl} loading="lazy" />
          </div>
        </section>

        {postOperations.length > 0 && (
          <section className="card">
            <div className="section-header">
              <h2>Try POST Endpoints</h2>
              <span className="muted">Send real POST requests without leaving the portal.</span>
            </div>
            <PostPlayground baseUrl={apiBaseUrl} operations={postOperations} />
          </section>
        )}

        <section className="card">
          <div className="section-header">
            <h2>Highlighted Endpoints</h2>
            <span className="muted">Automatically pulled from the OpenAPI spec</span>
          </div>
          {loading && <p className="muted">Loading OpenAPI spec…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && (
            <div className="endpoint-grid">
              {endpoints.map(endpoint => (
                <article key={`${endpoint.method}-${endpoint.path}`}>
                  <span className={`badge method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                  <p className="endpoint-path">{endpoint.path}</p>
                  <p className="endpoint-summary">{endpoint.summary}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Resources</h2>
          <div className="resource-grid">
            {resourceLinks.map(link => (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="resource-card">
                <span>{link.label}</span>
                <span aria-hidden="true">→</span>
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>
          Set <code>VITE_API_BASE_URL</code> when running <code>npm run dev:portal</code> to point the portal at a remote environment.
          Default: <code>{apiBaseUrl}</code>
        </p>
      </footer>
    </div>
  );
}
