/**
 * Standalone gRPC Server for GenOS
 * Isolates gRPC from the Express workers to prevent port conflicts (EADDRINUSE).
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs');

async function loadProtoDefinitions() {
  const PROTO_DIR = path.resolve(__dirname, 'proto');
  const definitions = {};
  
  if (!fs.existsSync(PROTO_DIR)) {
      console.warn(`[gRPC] Proto directory not found at ${PROTO_DIR}`);
      return definitions;
  }

  const files = fs.readdirSync(PROTO_DIR).filter(f => f.endsWith('.proto'));
  
  for (const file of files) {
    const protoPath = path.join(PROTO_DIR, file);
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    // Dynamically load services - simplified for this standalone wrapper
    for (const pkgName in protoDescriptor) {
        const pkg = protoDescriptor[pkgName];
        for (const svcName in pkg) {
            if (pkg[svcName] && pkg[svcName].service) {
                definitions[`${pkgName}.${svcName}`] = {
                    service: pkg[svcName].service,
                    handlers: {} // Handlers would be imported from src/grpc_services/
                };
            }
        }
    }
  }
  return definitions;
}

async function startGrpcServer() {
  const server = new grpc.Server();
  const definitions = await loadProtoDefinitions();

  for (const [name, impl] of Object.entries(definitions)) {
    // In a real implementation, we would map the handlers properly
    // server.addService(impl.service, impl.handlers);
    console.log(`[gRPC] Registered definition for ${name}`);
  }

  const port = process.env.GRPC_PORT || '50051';
  
  server.bindAsync(
    `127.0.0.1:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, boundPort) => {
      if (err) {
        console.error('[gRPC] Failed to bind server:', err);
        process.exit(1);
      }
      server.start();
      console.log(`[gRPC] Server running on port ${boundPort} (Isolated Process)`);
    }
  );
}

if (require.main === module) {
  startGrpcServer().catch(console.error);
}

module.exports = { startGrpcServer };
