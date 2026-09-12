const crypto = require('crypto');
const dns = require('dns').promises;
const https = require('https');
const { getDatabase } = require('../db');
const { isBlockedAddress, isLoopbackHostname } = require('./providerEndpointPolicy');

const pendingEvents = [];
const MAX_PENDING_EVENTS = Math.max(1, Number(process.env.GENOS_WEBHOOK_QUEUE_CAPACITY) || 1024);
let draining = false;

function accepts(hook, event) { try { const events = JSON.parse(hook.events || '["*"]'); return Array.isArray(events) && (events.includes('*') || events.includes(event.eventType)); } catch (_) { return false; } }

function matchesScope(hook, event) {
  const organizationId = event.payload?.organizationId || event.payload?.organization_id;
  const projectId = event.payload?.projectId || event.payload?.project_id;
  return Boolean(organizationId && projectId && hook.organization_id === organizationId && hook.project_id === projectId);
}

// Webhook targets are fetched server-side on every matching event, so each
// URL must point at a public HTTPS host. Loopback, private ranges and
// link-local addresses (including cloud metadata endpoints) are refused both
// at registration time and again immediately before dispatch.
const BLOCKED_HOSTNAME_PATTERN = /^(?:localhost|.*\.local|.*\.internal|metadata.*)$/i;

function isForbiddenAddress(address) {
  return isLoopbackHostname(address) || isBlockedAddress(address);
}

function invalidUrl(message) {
  return Object.assign(new Error(message), { statusCode: 400, code: 'INVALID_WEBHOOK_URL' });
}

async function resolvePublicWebhookTarget(rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || '')); } catch (_) { throw invalidUrl('Webhook URL must be a valid absolute HTTPS URL.'); }
  if (parsed.protocol !== 'https:') throw invalidUrl('Webhook URL must use HTTPS.');
  if (parsed.username || parsed.password) throw invalidUrl('Webhook URL must not embed credentials.');
  if (BLOCKED_HOSTNAME_PATTERN.test(parsed.hostname)) throw invalidUrl('Webhook URL must not target internal hostnames.');
  const lookups = await dns.lookup(parsed.hostname, { all: true }).catch(() => []);
  if (!lookups.length) throw invalidUrl(`Webhook hostname does not resolve: ${parsed.hostname}`);
  for (const entry of lookups) {
    if (isForbiddenAddress(entry.address)) throw invalidUrl(`Webhook URL resolves to a private or reserved address (${entry.address}).`);
  }
  const chosen = lookups[0];
  return {
    url: parsed.toString(),
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: `${parsed.pathname}${parsed.search}`,
    address: chosen.address,
    family: chosen.family
  };
}

async function assertPublicWebhookUrl(rawUrl) {
  const target = await resolvePublicWebhookTarget(rawUrl);
  return target.url;
}

// The connection is pinned to the address that was just validated, so a DNS
// record cannot be repointed at an internal host between validation and the
// HTTP request (DNS rebinding / TOCTOU).
function postPinned(target, body, headers, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: target.hostname,
      port: target.port,
      path: target.path,
      method: 'POST',
      servername: target.hostname,
      headers,
      timeout: timeoutMs,
      lookup: (hostname, options, callback) => {
        if (options && options.all) return callback(null, [{ address: target.address, family: target.family }]);
        return callback(null, target.address, target.family);
      }
    }, (response) => { response.resume(); resolve(response); });
    request.on('timeout', () => request.destroy(new Error('Webhook request timed out.')));
    request.on('error', reject);
    request.end(body);
  });
}

async function dispatchEvent(event) {
  try {
    const db = await getDatabase();
    const hooks = await db.all('SELECT * FROM webhook_subscriptions WHERE enabled = 1');
    for (const hook of hooks) {
      if (!accepts(hook, event) || !matchesScope(hook, event)) continue;
      let target;
      try { target = await resolvePublicWebhookTarget(hook.url); } catch (_) { continue; }
      // Per-hook secrets always win: the global env secret must never be
      // handed to an endpoint registered by someone else.
      const secret = hook.secret || process.env.GENOS_WEBHOOK_SECRET;
      if (!secret) continue;
      const body = JSON.stringify({ event, sentAt: new Date().toISOString() });
      const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
      try {
        const response = await postPinned(target, body, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-genos-signature': signature
        });
        if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Webhook returned HTTP ${response.statusCode}.`);
      } catch (_) {
        // A failed delivery must not retain the event or block later events.
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

module.exports = { dispatch, accepts, assertPublicWebhookUrl, resolvePublicWebhookTarget };
