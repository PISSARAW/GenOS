export class StudioRequestError extends Error {
  constructor(message, detail = {}) {
    super(message, { cause: detail.cause });
    this.name = detail.aborted ? 'AbortError' : 'StudioRequestError';
    this.kind = detail.kind || 'http';
    this.status = detail.status;
    this.code = detail.code;
    this.outcome = detail.outcome || 'not-dispatched';
    this.retryable = detail.retryable === true;
  }
}

function endpointPath(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith('/api/') || /[\\#]/.test(endpoint)) {
    throw new StudioRequestError('Destination API locale requise.', { kind: 'validation' });
  }
  const url = new URL(endpoint, 'http://studio.invalid');
  if (url.origin !== 'http://studio.invalid' || !url.pathname.startsWith('/api/')) {
    throw new StudioRequestError('Destination API locale requise.', { kind: 'validation' });
  }
  return url.pathname + url.search;
}

export function requestSpec(endpoint, options) {
  const path = endpointPath(endpoint);
  const hasBody = options.body !== undefined;
  const method = String(options.method || (hasBody ? 'POST' : 'GET')).toUpperCase();
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)) {
    throw new StudioRequestError('Méthode HTTP non prise en charge.', { kind: 'validation' });
  }
  const read = ['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (read && hasBody) throw new StudioRequestError('Lecture avec body refusée.', { kind: 'validation' });
  return { endpoint: path, method, read,
    body: hasBody ? JSON.stringify(options.body) : undefined };
}

function responseFailure(response, value) {
  const code = value?.error?.code || value?.code;
  const message = value?.error?.message || code || 'Requête refusée';
  return new StudioRequestError(`${response.status || ''} ${message}`.trim(),
    { status: response.status, code, kind: response.ok ? 'decision' : 'http', outcome: 'responded' });
}

export async function responseValue(response) {
  if (response.ok && response.status === 204) return null;
  let value;
  try { value = await response.json(); }
  catch (cause) {
    throw new StudioRequestError(`${response.status || ''} Réponse backend invalide (JSON attendu).`.trim(),
      { kind: 'protocol', status: response.status, cause, outcome: 'unknown' });
  }
  if (!response.ok || value?.success === false) {
    throw responseFailure(response, value);
  }
  return value;
}

export function requestFailure(error, context) {
  const { reason, spec, dispatched } = context;
  const outcome = dispatched ? 'unknown' : 'not-dispatched';
  if (reason) return new StudioRequestError('Requête interrompue.',
    { kind: reason, aborted: true, outcome, retryable: spec.read && reason === 'timeout', cause: error });
  if (error instanceof StudioRequestError) {
    error.retryable = spec.read && (error.status >= 500 || error.kind === 'protocol');
    if (!spec.read && error.status >= 500) error.outcome = 'unknown';
    return error;
  }
  return new StudioRequestError('Backend inaccessible. Vérifiez la connexion réseau.',
    { kind: 'network', outcome, retryable: spec.read, cause: error });
}
