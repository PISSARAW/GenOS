'use strict';

function currentKeyId() {
  const value = String(process.env.GENOS_EPISTEMIC_RECEIPT_KEY_ID || 'legacy').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new Error('Invalid AEIS receipt key ID.');
  return value;
}

function previousKeys() {
  const raw = process.env.GENOS_EPISTEMIC_RECEIPT_PREVIOUS_KEYS;
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { throw new Error('Invalid AEIS previous key map.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid AEIS previous key map.');
  return parsed;
}

function keyFor(keyId) {
  const requested = keyId || 'legacy';
  const secret = requested === currentKeyId()
    ? process.env.GENOS_EPISTEMIC_RECEIPT_SECRET : previousKeys()[requested];
  if (typeof secret !== 'string' || !secret.trim()) throw new Error(`AEIS receipt key unavailable: ${requested}`);
  return secret;
}

module.exports = { currentKeyId, keyFor };
