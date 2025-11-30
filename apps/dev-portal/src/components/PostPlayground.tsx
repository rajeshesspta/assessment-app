import { useState } from 'react';
import type { FormEvent } from 'react';

interface PostOperation {
  id: string;
  path: string;
  summary: string;
  description?: string;
  exampleBody: string;
  schema: string | null;
}

interface PostPlaygroundProps {
  baseUrl: string;
  operations: PostOperation[];
}

export function PostPlayground({ baseUrl, operations }: PostPlaygroundProps) {
  if (!operations.length) {
    return <p className="muted">No POST endpoints available.</p>;
  }

  return (
    <div className="post-grid">
      {operations.map(operation => (
        <PostOperationForm key={operation.id} baseUrl={baseUrl} operation={operation} />
      ))}
    </div>
  );
}

interface PostOperationFormProps {
  baseUrl: string;
  operation: PostOperation;
}

function PostOperationForm({ baseUrl, operation }: PostOperationFormProps) {
  const [path, setPath] = useState(operation.path);
  const [apiKey, setApiKey] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [body, setBody] = useState(operation.exampleBody);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: number; payload: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    let parsedBody: unknown = undefined;
    if (body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch (parseError) {
        setError('Request body must be valid JSON.');
        return;
      }
    }

    setLoading(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) headers['x-api-key'] = apiKey;
      if (tenantId) headers['x-tenant-id'] = tenantId;

      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: parsedBody ? JSON.stringify(parsedBody) : undefined,
      });

      const contentType = response.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? JSON.stringify(await response.json(), null, 2)
        : await response.text();

      setResult({ status: response.status, payload });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="post-card">
      <header>
        <span className="badge method-post">POST</span>
        <h3>{operation.summary}</h3>
        <p className="endpoint-path">{operation.path}</p>
        {operation.description && <p className="muted small">{operation.description}</p>}
        {operation.schema && (
          <details className="schema-block">
            <summary>Request Schema</summary>
            <pre>
              <code>{operation.schema}</code>
            </pre>
          </details>
        )}
      </header>
      <form onSubmit={handleSubmit} className="post-form">
        <label className="form-control">
          <span>Path</span>
          <input value={path} onChange={event => setPath(event.target.value)} placeholder="/items" />
        </label>
        <label className="form-control">
          <span>x-api-key</span>
          <input value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="tenant or system api key" />
        </label>
        <label className="form-control">
          <span>x-tenant-id</span>
          <input value={tenantId} onChange={event => setTenantId(event.target.value)} placeholder="tenant-demo" />
        </label>
        <label className="form-control">
          <span>JSON Body</span>
          <textarea value={body} onChange={event => setBody(event.target.value)} rows={8} spellCheck={false} />
        </label>
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Sending…' : 'Send Request'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="response-block">
          <div className="response-meta">
            <span>Status: {result.status}</span>
            <button type="button" onClick={() => setResult(null)}>Clear</button>
          </div>
          <pre>
            <code>{result.payload}</code>
          </pre>
        </div>
      )}
    </article>
  );
}
