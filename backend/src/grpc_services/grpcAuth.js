const AUTHENTICATED_STATUS = 16;

function configuredSecret() {
  return String(process.env.GENOS_GRPC_SHARED_SECRET || '').trim();
}

function metadataValues(call, key) {
  const metadata = call?.metadata;
  if (!metadata || typeof metadata.get !== 'function') return [];
  return metadata.get(key).map((value) => String(value));
}

function isAuthorized(call) {
  const secret = configuredSecret();
  if (!secret) return false;
  const candidates = [
    ...metadataValues(call, 'x-genos-grpc-key'),
    ...metadataValues(call, 'authorization').map((value) => value.replace(/^Bearer\s+/i, ''))
  ];
  return candidates.includes(secret);
}

function guardHandler(handler) {
  if (typeof handler !== 'function') return handler;
  return function guardedGrpcHandler(call, callback) {
    if (!isAuthorized(call)) {
      callback({ code: AUTHENTICATED_STATUS, message: 'gRPC authentication is required.' });
      return;
    }
    return handler.call(this, call, callback);
  };
}

function guardService(service) {
  return Object.fromEntries(Object.entries(service || {}).map(([name, handler]) => [name, guardHandler(handler)]));
}

module.exports = { configuredSecret, isAuthorized, guardHandler, guardService };
