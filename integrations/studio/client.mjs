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
    for (const controller of this.controllers) controller.abort();
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
    const generation = this.generation;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
    try {
      const response = await this.transport(endpoint, { method: options.method || (options.body ? 'POST' : 'GET'),
        headers: this.headers(), cache: 'no-store', signal: controller.signal,
        body: options.body ? JSON.stringify(options.body) : undefined });
      const value = await response.json();
      if (generation !== this.generation) throw new DOMException('Session modifiée', 'AbortError');
      if (!response.ok) throw Object.assign(new Error(`${response.status} ${value.error?.message || value.error?.code || 'Requête refusée'}`),
        { status: response.status, code: value.error?.code });
      return value;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  allowed(permission) {
    const permissions = this.session?.permissions || [];
    return permissions.includes('all') || permissions.includes(permission);
  }
}
