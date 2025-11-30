import { useEffect, useState } from 'react';
import type { OpenAPIV3 } from 'openapi-types';

interface OpenApiState {
  spec: OpenAPIV3.Document | null;
  loading: boolean;
  error: string | null;
}

export function useOpenApiSpec(url: string) {
  const [state, setState] = useState<OpenApiState>({ spec: null, loading: true, error: null });

  useEffect(() => {
    if (!url) {
      setState(prev => ({ ...prev, loading: false, error: 'No OpenAPI URL configured' }));
      return;
    }

    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));

    fetch(url)
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Unable to load spec (${response.status})`);
        }
        return response.json();
      })
      .then((spec: OpenAPIV3.Document) => {
        if (!cancelled) {
          setState({ spec, loading: false, error: null });
        }
      })
      .catch(error => {
        if (!cancelled) {
          setState({ spec: null, loading: false, error: error.message });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
