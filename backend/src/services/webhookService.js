const crypto = require('crypto');
const dns = require('dns').promises;
const { getDatabase } = require('../db');

const pendingEvents = [];
const MAX_PENDING_EVENTS = Math.max(1, Number(process.env.GENOS_WEBHOOK_QUEUE_CAPACITY) || 1024);
let draining = false;

function accepts(hook, event) { try { const events = JSON.parse(hook.events || '["*"]'); return Array.isArray(events) && (events.includes('*') || events.includes(event.eventType)); } catch (_) { return false; } }

// Webhook targets are fetched server-side on every matching event, so each
// URL must point at a public HTTPS host. Loopback, private ranges and
// link-local addresses (including cloud metadata endpoints) are refused both
// at registration time and again immediately before dispatch.
const BLOCKED_HOSTNAME_PATTERN = /^(?:localhost|.*\.local|.*\.internal|metadata.*)$/i;

function isPrivateAddress(address) {
  const value = String(address || '');
  const v4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const first = Number(v4[1]);
    const second = Number(v4[2]);
    if (first === 0 || first === 10 || first === 127) return true;
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;
    return false;
  }
  const lower = value.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
  return false;
}

function invalidUrl(message) {
  return Object.assign(new Error(message), { statusCode: 400, code: 'INVALID_WEBHOOK_URL' });
}

async function assertPublicWebhookUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || '')); } catch (_) { throw invalidUrl('Webhook URL must be a valid absolute HTTPS URL.'); }
  if (parsed.protocol !== 'https:') throw invalidUrl('Webhook URL must use HTTPS.');
  if (parsed.username || parsed.password) throw invalidUrl('Webhook URL must not embed credentials.');
  if (BLOCKED_HOSTNAME_PATTERN.test(parsed.hostname)) throw invalidUrl('Webhook URL must not target internal hostnames.');
  const lookups = await dns.lookup(parsed.hostname, { all: true }).catch(() => []);
  if (!lookups.length) throw invalidUrl(`Webhook hostname does not resolve: ${parsed.hostname}`);
  for (const entry of lookups) {
    if (isPrivateAddress(entry.address)) throw invalidUrl(`Webhook URL resolves to a private or reserved address (${entry.address}).`);
  }
  return parsed.toString();
}

async function dispatchEvent(event) {
  try {
    const db = await getDatabase();
    const hooks = await db.all('SELECT * FROM webhook_subscriptions WHERE enabled = 1');
    for (const hook of hooks) {
      if (!accepts(hook, event)) continue;
      try { await assertPublicWebhookUrl(hook.url); } catch (_) { continue; }
      // Per-hook secrets always win: the global env secret must never be
      // handed to an endpoint registered by someone else.
      const secret = hook.secret || process.env.GENOS_WEBHOOK_SECRET;
      if (!secret) continue;
      const body = JSON.stringify({ event, sentAt: new Date().toISOString() });
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        await fetch(hook.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-genos-signature': signature }, body, signal: controller.signal });
      } catch (_) {
        // A failed delivery must not retain the event or block later events.
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (_) {}
}

function dispatch(event) {
  if (pendingEvents.length >= MAX_PENDING_EVENTS) pendingEvents.shift();
  pendingEvents.push(event);
  if (draining) return;
  draining = true;
  (async () => {
    try {
      while (pendingEvents.length) await dispatchEvent(pendingEvents.shift());
    } finally {
      draining = false;
      if (pendingEvents.length) dispatch(pendingEvents.shift());
    }
  })().catch(() => { draining = false; });
}

module.exports = { dispatch, accepts, assertPublicWebhookUrl };
