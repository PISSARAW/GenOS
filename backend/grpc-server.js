/**
 * Standalone gRPC Server for GenOS
 * Isolates gRPC from the Express workers to prevent port conflicts.
 */

const grpc = require('@grpc/grpc-js');
const loadAllProtos = require('./proto/index.js');
const registerAllServices = require('./src/grpc_services/index.js');

async function startGrpcServer() {
  const server = new grpc.Server();
  const descriptors = loadAllProtos();

  for (const [name, desc] of Object.entries(descriptors)) {
    registerAllServices(server, desc);
  }

  const port = process.env.GRPC_PORT || '50051';
  
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
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
