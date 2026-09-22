/**
 * Signal Validation Utilities — payload size, rate limiting, args validation
 */

const MAX_SIGNAL_DATA_BYTES = 64 * 1024;
const MAX_SIGNAL_BLOB_BYTES = 1024 * 1024;
const RATE_LIMIT_PER_MINUTE = 120;
const MAX_DB_RETRIES = 3;
const DB_RETRY_DELAY_MS = 100;

const rateLimitWindow = new Map();

function checkRateLimit(senderId) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const entry = rateLimitWindow.get(senderId) || { count: 0, resetAt: now + 60_000 };
  if (entry.resetAt < windowStart) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }
  entry.count++;
  rateLimitWindow.set(senderId, entry);
  if (entry.count > RATE_LIMIT_PER_MINUTE) return false;
  if (rateLimitWindow.size > 1000) {
    const cutoff = now - 120_000;
    for (const [k, v] of rateLimitWindow) {
      if (v.resetAt < cutoff) rateLimitWindow.delete(k);
    }
  }
  return true;
}

function validatePayloadSize(signalData, signalBlob) {
  if (signalData) {
    const dataSize = Buffer.byteLength(JSON.stringify(signalData), 'utf8');
    if (dataSize > MAX_SIGNAL_DATA_BYTES) {
      return { valid: false, reason: `signalData exceeds ${MAX_SIGNAL_DATA_BYTES} bytes (${dataSize})` };
    }
  }
  if (signalBlob && signalBlob.length > MAX_SIGNAL_BLOB_BYTES) {
    return { valid: false, reason: `signalBlob exceeds ${MAX_SIGNAL_BLOB_BYTES} bytes (${signalBlob.length})` };
  }
  return { valid: true };
}

function validateArgs(params) {
  if (params.signalData !== undefined && params.signalData !== null && typeof params.signalData !== 'object') {
    throw new Error('signalData must be an object');
  }
  if (params.topic && String(params.topic).length > 256) {
    throw new Error('topic must be 256 chars or less');
  }
  return true;
}

async function retryDbOperation(operation, retries = MAX_DB_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(resolve => setTimeout(resolve, DB_RETRY_DELAY_MS * attempt));
    }
  }
}

module.exports = {
  checkRateLimit,
  validatePayloadSize,
  validateArgs,
  retryDbOperation,
  RATE_LIMIT_PER_MINUTE,
};
