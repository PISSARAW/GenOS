const crypto = require('crypto');

const UNAUTHENTICATED_STATUS = 16;
const PERMISSION_DENIED_STATUS = 7;

function configuredSecret() {
  return String(process.env.GENOS_GRPC_SHARED_SECRET || '').trim();
}

function metadataValues(call, key) {
  const metadata = call?.metadata;
  if (!metadata || typeof metadata.get !== 'function') return [];
  return metadata.get(key).map((value) => String(value));
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function secretMatches(candidate, secretHash) {
  const candidateHash = hashSecret(candidate);
  if (candidateHash.length !== secretHash.length) return false;
  return crypto.timingSafeEqual(candidateHash, secretHash);
}

function isAuthorized(call) {
  const secret = configuredSecret();
  if (!secret) return false;
  const secretHash = hashSecret(secret);
  const candidates = [
    ...metadataValues(call, 'x-genos-grpc-key'),
    ...metadataValues(call, 'authorization').map((value) => value.replace(/^Bearer\s+/i, ''))
  ];
  for (const candidate of candidates) {
    if (secretMatches(candidate, secretHash)) return true;
  }
  return false;
}

function hasCredentials(call) {
  return metadataValues(call, 'x-genos-grpc-key').length > 0
    || metadataValues(call, 'authorization').some((value) => /^Bearer\s+/i.test(value));
}

function guardHandler(handler) {
  if (typeof handler !== 'function') return handler;
  return function guardedGrpcHandler(call, callback) {
    if (!isAuthorized(call)) {
      callback({
        code: hasCredentials(call) ? PERMISSION_DENIED_STATUS : UNAUTHENTICATED_STATUS,
        message: hasCredentials(call) ? 'gRPC credentials were rejected.' : 'gRPC authentication is required.'
      });
      return;
    }
    return handler.call(this, call, callback);
  };
}

function guardService(service) {
  return Object.fromEntries(Object.entries(service || {}).map(([name, handler]) => [name, guardHandler(handler)]));
}

module.exports = { configuredSecret, isAuthorized, hasCredentials, guardHandler, guardService };
