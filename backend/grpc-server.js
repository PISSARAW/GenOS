/**
 * Standalone gRPC Server for GenOS
 * Isolates gRPC from the Express workers to prevent port conflicts.
 */

const grpc = require('@grpc/grpc-js');
const loadAllProtos = require('./proto/index.js');
const registerAllServices = require('./src/grpc_services/index.js');
const { readPrivateTlsPair } = require('./src/services/tlsConfig');

async function startGrpcServer() {
  const server = new grpc.Server();
  const descriptors = loadAllProtos();

  for (const [name, desc] of Object.entries(descriptors)) {
    registerAllServices(server, desc);
  }

  const port = process.env.GRPC_PORT || '50051';
  const tlsKey = process.env.GENOS_GRPC_TLS_KEY;
  const tlsCert = process.env.GENOS_GRPC_TLS_CERT;
  const tlsPair = readPrivateTlsPair(tlsKey, tlsCert);
  const bindAddress = process.env.GRPC_BIND_ADDRESS || (tlsPair ? '0.0.0.0' : '127.0.0.1');
  const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!tlsPair && !loopback.has(bindAddress)) {
    throw new Error('Refusing insecure gRPC on a non-loopback bind address; configure GENOS_GRPC_TLS_KEY/CERT.');
  }
  const credentials = tlsPair
    ? grpc.ServerCredentials.createSsl(null, [tlsPair], false)
    : grpc.ServerCredentials.createInsecure();
  server.bindAsync(
    `${bindAddress}:${port}`,
    credentials,
    (err, boundPort) => {
      if (err) {
        console.error('[gRPC] Failed to bind server:', err);
        process.exit(1);
      }
      server.start();
      console.log(`[gRPC] Server running on port ${boundPort} with all microservices active`);
    }
  );
  return server;
}

if (require.main === module) {
  startGrpcServer().catch(console.error);
}

module.exports = { startGrpcServer };
