export class StudioClient {
  constructor(transport = globalThis.fetch.bind(globalThis)) {
    this.transport = transport;
    this.session = null;
    this.generation = 0;
    this.controllers = new Set();
    this.timeoutMs = 10000;
  }

  setSession(session) {
    this.generation += 1;
    for (const controller of this.controllers) controller.abort('session');
    this.controllers.clear();
    this.session = session ? { ...session } : null;
  }

  headers() {
    if (!this.session) throw new Error('Session absente. Reconnectez-vous.');
    return { Authorization: `Bearer ${this.session.token}`,
      'X-Organization-Id': this.session.organization || '',
      'X-Project-Id': this.session.project || '', 'Content-Type': 'application/json' };
  }

  async request(endpoint, options = {}) {
    const spec = requestSpec(endpoint, options);
    const headers = this.headers();
    if (options.signal?.aborted) throw new StudioRequestError('Requête annulée.', { kind: 'cancelled', aborted: true });
    const generation = this.generation;
    const controller = new AbortController();
    this.controllers.add(controller);
    const cancel = () => controller.abort('cancelled');
    options.signal?.addEventListener('abort', cancel, { once: true });
    let dispatched = false;
    const timeout = setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? this.timeoutMs);
    let interrupted;
    const abort = new Promise((_, reject) => {
      interrupted = () => reject(new DOMException('Requête interrompue', 'AbortError'));
      controller.signal.addEventListener('abort', interrupted, { once: true });
    });
    try {
      dispatched = true;
      const request = Promise.resolve(this.transport(spec.endpoint, { method: spec.method,
        headers, cache: 'no-store', redirect: 'error', signal: controller.signal, body: spec.body })).then(responseValue);
      const value = await Promise.race([request, abort]);
      if (generation !== this.generation) controller.abort('session');
      if (controller.signal.aborted) throw new DOMException('Requête interrompue', 'AbortError');
      return value;
    } catch (error) {
      throw requestFailure(error, { reason: controller.signal.reason, spec, dispatched });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', interrupted);
      this.controllers.delete(controller);
    }
  }

  allowed(permission) {
    const permissions = this.session?.permissions || [];
    return permissions.includes('all') || permissions.includes(permission);
  }
}
import { StudioRequestError, requestSpec, responseValue, requestFailure } from './requestErrors.mjs';
