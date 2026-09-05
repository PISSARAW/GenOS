/**
 * GenOS Dynamic gRPC Services Registrar
 * Discovers and registers all 41 microservices and core services onto the gRPC server.
 */

const fs = require('fs');
const path = require('path');

function findServices(obj) {
  const found = [];
  if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return found;

  for (const k in obj) {
    const val = obj[k];
    if (val && (typeof val === 'function' || typeof val === 'object')) {
      if (val.service) {
        found.push({ name: k, serviceDef: val.service });
      } else {
        found.push(...findServices(val));
      }
    }
  }
  return found;
}

const registeredServices = new WeakSet();

function registerAllServices(grpcServer, protoDescriptor) {
  if (!grpcServer || !protoDescriptor) return;

  const services = findServices(protoDescriptor);
  for (const { name, serviceDef } of services) {
    if (registeredServices.has(serviceDef)) continue;

    const handlerName = name.charAt(0).toLowerCase() + name.slice(1);
    const handlerPath = path.join(__dirname, `${handlerName}.js`);

    if (fs.existsSync(handlerPath)) {
      try {
        const handler = require(handlerPath);
        grpcServer.addService(serviceDef, handler);
        registeredServices.add(serviceDef);
      } catch (err) {
        console.error(`[gRPC] Error registering service ${name}:`, err.message);
      }
    } else {
      console.warn(`[gRPC] No handler found for service ${name} at ${handlerPath}`);
    }
  }
}

module.exports = registerAllServices;
