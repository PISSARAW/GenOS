const crypto = require('crypto');

const SECRET_KEY = process.env.GENOS_PROMOTION_SECRET || 'dev-insecure-promotion-secret-key-12345';

/**
 * Validates a cryptographic signature for a promotion approval payload.
 * Supports HMAC-SHA256.
 * Payload format: { runId, timestamp, signerId }
 */
function validateSignature(payload, signature) {
  if (!signature) {
    throw new Error('Missing cryptographic signature for human promotion approval');
  }

  // Validate timestamp to prevent replay attacks (e.g., max 5 minutes old)
  const now = Date.now();
  if (!payload.timestamp) {
    throw new Error('Missing timestamp in signature payload');
  }
  if (now - payload.timestamp > 5 * 60 * 1000) {
    throw new Error('Promotion signature expired');
  }

  // Serialize payload deterministically
  const dataToSign = `${payload.runId}:${payload.timestamp}:${payload.signerId || ''}`;

  const expectedSignature = crypto.createHmac('sha256', SECRET_KEY)
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
  const dataToSign = `${payload.runId}:${payload.timestamp}:${payload.signerId || ''}`;
  return crypto.createHmac('sha256', SECRET_KEY)
               .update(dataToSign)
               .digest('hex');
}

module.exports = {
  validateSignature,
  generateSignature
};
