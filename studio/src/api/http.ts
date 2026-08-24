/**
 * GenOS Studio Centralized API Client
 * Strict typed endpoints with RBAC & Anti-CSRF header propagation.
 */

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
export const API_BASE_URL = configuredApiBaseUrl || (import.meta.env.DEV ? 'http://localhost:4000' : '');

const TOKEN_KEY = 'genos_auth_token';
const CSRF_KEY = 'genos_csrf_token';
const ORGANIZATION_KEY = 'genos_organization_id';
const PROJECT_KEY = 'genos_project_id';

export type TenantScope = { organizationId: string; projectId: string };

export function getTenantScope(): TenantScope | null {
  try {
    const organizationId = localStorage.getItem(ORGANIZATION_KEY) || '';
    const projectId = localStorage.getItem(PROJECT_KEY) || '';
    return organizationId && projectId ? { organizationId, projectId } : null;
  } catch {
    return null;
  }
}

export function setTenantScope(scope: TenantScope): void {
  try {
    localStorage.setItem(ORGANIZATION_KEY, scope.organizationId);
    localStorage.setItem(PROJECT_KEY, scope.projectId);
  } catch {}
}

export function clearTenantScope(): void {
  try {
    localStorage.removeItem(ORGANIZATION_KEY);
    localStorage.removeItem(PROJECT_KEY);
  } catch {}
}

export function getAuthToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// Anti-CSRF tokens are minted by the backend (GET /api/security/csrf) and
// echoed back in the X-CSRF-Token header. A locally invented value could
// never satisfy server validation, so the Studio never fabricates one.
export async function ensureCsrfToken(): Promise<string> {
  try {
    const existing = localStorage.getItem(CSRF_KEY);
    if (existing) {
      return existing;
    }
  } catch {}
  const issued = await apiRequest<{ csrfToken?: string }>('/api/security/csrf');
  const token = issued?.csrfToken || '';
  if (!token) {
    throw new Error('Backend did not issue an anti-CSRF token.');
  }
  try {
    localStorage.setItem(CSRF_KEY, token);
  } catch {}
  return token;
}

export function getCsrfToken(): string {
  try {
    return localStorage.getItem(CSRF_KEY) || '';
  } catch {
    return '';
  }
}

export interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

export async function apiRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const method = options.method || 'GET';
  const mutating = method !== 'GET';
  const csrf = mutating ? await ensureCsrfToken() : getCsrfToken();
  const token = getAuthToken();
  const tenantScope = getTenantScope();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrf,
    'X-Access-Key': token,
    'Authorization': `Bearer ${token}`,
    ...(tenantScope ? { 'X-Organization-Id': tenantScope.organizationId, 'X-Project-Id': tenantScope.projectId } : {}),
    ...(options.headers || {})
  };

  const config: RequestInit = {
    method,
    headers,
    credentials: 'omit'
  };

  if (options.body && method !== 'GET') {
    config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        errorDetail = errJson.error.message;
      }
    } catch {}
    throw new Error(errorDetail);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text() as unknown as T;
}

/**
 * Opens an SSE response with the same credentials and tenant scope as API calls.
 * Native EventSource cannot attach these headers, which would make protected
 * streams appear to start before immediately disconnecting.
 */
export async function openApiEventStream(endpoint: string): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();
  const tenantScope = getTenantScope();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      'X-Access-Key': token,
      Authorization: `Bearer ${token}`,
      ...(tenantScope ? { 'X-Organization-Id': tenantScope.organizationId, 'X-Project-Id': tenantScope.projectId } : {})
    },
    credentials: 'omit'
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status} ${response.statusText}`;
    try { detail = (await response.json())?.error?.message || detail; } catch {}
    throw new Error(detail);
  }
  return response;
}


/**
 * Subscribes to an SSE endpoint with the same credentials as apiRequest.
 * Native EventSource cannot attach Authorization headers, which made
 * protected streams connect anonymously or fail outright.
 */
export interface ApiEventStreamHandlers {
  onOpen?: () => void;
  onMessage: (data: any) => void;
  onError?: (error: Error) => void;
}

export async function subscribeApiEventStream(
  endpoint: string,
  handlers: ApiEventStreamHandlers
): Promise<() => void> {
  const controller = new AbortController();
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const close = () => {
    closed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    controller.abort();
  };

  void (async () => {
    let backoffMs = 1000;

    while (!closed) {
      try {
        const response = await openApiEventStream(endpoint);
        if (!response.body) {
          throw new Error('This browser does not support streaming responses.');
        }
        if (closed) break;
        handlers.onOpen?.();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (!closed) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let separator = buffer.indexOf('\n\n');
            while (separator !== -1) {
              const rawEvent = buffer.slice(0, separator);
              buffer = buffer.slice(separator + 2);
              separator = buffer.indexOf('\n\n');
              for (const line of rawEvent.split('\n')) {
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (!payload) continue;
                try {
                  handlers.onMessage(JSON.parse(payload));
                  backoffMs = 1000;
                } catch {}
              }
            }
          }
        } catch (error: any) {
          if (!closed) throw error;
        }
      } catch (error: any) {
        if (closed) break;
        handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
      }

      if (closed) break;
      await new Promise<void>((resolve) => {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          resolve();
        }, backoffMs);
      });
      if (closed) break;
      backoffMs = Math.min(backoffMs * 2, 30000);
    }
  })();

  return close;
}
