/**
 * Standalone gRPC Server for GenOS
 * Isolates gRPC from the Express workers to prevent port conflicts.
 */

const grpc = require('@grpc/grpc-js');
const loadAllProtos = require('./proto/index.js');
const registerAllServices = require('./src/grpc_services/index.js');
const { readTransportTlsConfig, grpcServerCredentials } = require('./src/services/tlsConfig');
const { readPort } = require('./src/services/runtimeConfig');

async function startGrpcServer() {
  const server = new grpc.Server();
  const descriptors = loadAllProtos();

  for (const [name, desc] of Object.entries(descriptors)) {
    registerAllServices(server, desc);
  }

  const port = readPort('GRPC_PORT', process.env.GRPC_PORT, 50051);
  const tls = readTransportTlsConfig({ keyEnv: 'GENOS_GRPC_TLS_KEY', certEnv: 'GENOS_GRPC_TLS_CERT', caEnv: 'GENOS_GRPC_CLIENT_CA', requiredEnv: 'GENOS_GRPC_MTLS_REQUIRED' });
  const bindAddress = process.env.GRPC_BIND_ADDRESS || (tls.pair ? '0.0.0.0' : '127.0.0.1');
  const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!tls.pair && !loopback.has(bindAddress)) {
    throw new Error('Refusing insecure gRPC on a non-loopback bind address; configure GENOS_GRPC_TLS_KEY/CERT.');
  }
  const credentials = grpcServerCredentials(grpc, tls);
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
