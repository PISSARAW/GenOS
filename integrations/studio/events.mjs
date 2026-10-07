export function parseFrame(frame) {
  const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
  return data ? JSON.parse(data) : null;
}

export async function readEvents(body, receive) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll('\r', '');
      if (buffer.length > 1024 * 1024) throw new Error('Événement trop volumineux.');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const event = parseFrame(buffer.slice(0, boundary));
        if (event) receive(event);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
}

export class EventStream {
  constructor(api, callbacks) {
    this.api = api;
    this.callbacks = callbacks;
    this.controller = null;
    this.timer = null;
    this.seen = new Set();
    this.serial = 0;
  }

  stop() {
    this.serial += 1;
    this.controller?.abort();
    clearTimeout(this.timer);
    this.seen.clear();
  }

  start() {
    this.stop();
    if (!this.api.allowed('telemetry:read') || !this.api.session.project) return;
    this.connect(this.serial, 1000);
  }

  receive(event) {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value);
    this.callbacks.event(event);
  }

  async connect(serial, delay) {
    this.controller = new AbortController();
    this.api.controllers.add(this.controller);
    try {
      const response = await this.api.transport('/api/telemetry/stream', {
        headers: this.api.headers(), signal: this.controller.signal, cache: 'no-store' });
      if (serial !== this.serial) return;
      if (!response.ok) {
        this.callbacks.status('Flux refusé : ' + response.status);
        if (response.status === 401) this.callbacks.expired();
        if ([401, 403].includes(response.status)) return;
        throw new Error('Flux indisponible');
      }
      this.callbacks.status('Connecté — état resynchronisé');
      await this.callbacks.sync();
      await readEvents(response.body, event => { if (serial === this.serial) this.receive(event); });
    } catch (error) {
      if (serial === this.serial) this.callbacks.status('Connexion interrompue — nouvelle tentative');
    } finally { this.api.controllers.delete(this.controller); }
    if (serial !== this.serial) return;
    this.timer = setTimeout(() => this.connect(serial, Math.min(delay * 2, 30000)), delay);
  }
}
