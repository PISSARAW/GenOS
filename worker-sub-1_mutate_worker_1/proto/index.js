/**
 * Auto-discovering gRPC Proto Loader
 * Loads all .proto definitions dynamically from backend/proto/
 */

const fs = require('fs');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

module.exports = function loadAllProtos() {
  const services = {};
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.proto'));
  for (const file of files) {
    const serviceName = file.replace('.proto', '');
    try {
      const packageDefinition = protoLoader.loadSync(path.join(__dirname, file), {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      });
      services[serviceName] = grpc.loadPackageDefinition(packageDefinition);
    } catch (err) {
      console.warn(`[gRPC ProtoLoader] Warning: failed to load ${file}:`, err.message);
    }
  }
  return services;
};
