const crypto = require('crypto');

function secretKey() {
  const value = String(process.env.GENOS_PROMOTION_SECRET || '').trim();
  if (!value) throw new Error('GENOS_PROMOTION_SECRET must be configured.');
  return value;
}

function signaturePayload(payload) {
  const base = `${payload.runId}:${payload.timestamp}:${payload.signerId || ''}`;
  if (payload.payloadHash === undefined) return base;
  if (!/^[a-f0-9]{64}$/i.test(String(payload.payloadHash || ''))) {
    throw new Error('Promotion signature requires the approved payload hash');
  }
  return `${base}:${payload.payloadHash.toLowerCase()}`;
}

/**
 * Validates a cryptographic signature for a promotion approval payload.
 * Supports HMAC-SHA256.
 * Payload format: { runId, timestamp, signerId, payloadHash }
 */
function validateSignature(payload, signature) {
  if (!signature) {
    throw new Error('Missing cryptographic signature for human promotion approval');
  }

  // Validate timestamp to prevent replay attacks (e.g., max 5 minutes old)
  const now = Date.now();
  if (!Number.isSafeInteger(payload.timestamp)) {
    throw new Error('Missing timestamp in signature payload');
  }
  if (Math.abs(now - payload.timestamp) > 5 * 60 * 1000) {
    throw new Error('Promotion signature expired');
  }
  const dataToSign = signaturePayload(payload);

  const expectedSignature = crypto.createHmac('sha256', secretKey())
                                  .update(dataToSign)
                                  .digest('hex');

  const bufExpected = Buffer.from(expectedSignature, 'hex');
  let bufReceived;
  try {
    bufReceived = Buffer.from(signature, 'hex');
  } catch (e) {
    throw new Error('Invalid signature format');
  }

  // Use timing-safe equal to prevent timing attacks
  if (bufReceived.length !== bufExpected.length || 
      !crypto.timingSafeEqual(bufReceived, bufExpected)) {
    throw new Error('Invalid cryptographic signature for human promotion approval');
  }

  return true;
}

/**
 * Generates a valid signature (useful for tests or internal clients).
 */
function generateSignature(payload) {
  const dataToSign = signaturePayload(payload);
  return crypto.createHmac('sha256', secretKey())
               .update(dataToSign)
               .digest('hex');
}

module.exports = {
  validateSignature,
  generateSignature
};
