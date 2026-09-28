/**
 * GenOS Dynamic gRPC Services Registrar
 * Discovers and registers all 41 microservices and core services onto the gRPC server.
 */

const fs = require('fs');
const path = require('path');
const { guardService } = require('./grpcAuth');

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
  if (!grpcServer || !protoDescriptor) return { registered: [], missing: [], errors: [] };

  const report = { registered: [], missing: [], errors: [] };
  const services = findServices(protoDescriptor);
  for (const { name, serviceDef } of services) {
    if (registeredServices.has(serviceDef)) continue;

    const handlerName = name.charAt(0).toLowerCase() + name.slice(1);
    const handlerPath = path.join(__dirname, `${handlerName}.js`);

    if (!fs.existsSync(handlerPath)) {
      report.missing.push({ service: name, reason: `no handler at ${handlerPath}` });
      console.warn(`[gRPC] No handler found for service ${name} at ${handlerPath}`);
      continue;
    }
    try {
      const handler = require(handlerPath);
      const missingMethods = Object.keys(serviceDef).filter((methodName) => typeof handler[methodName] !== 'function');
      if (missingMethods.length) {
        throw new Error(`handler is missing RPC methods: ${missingMethods.join(', ')}`);
      }
      grpcServer.addService(serviceDef, guardService(handler));
      registeredServices.add(serviceDef);
      report.registered.push(name);
    } catch (err) {
      report.errors.push({ service: name, reason: err.message });
      console.error(`[gRPC] Error registering service ${name}:`, err.message);
    }
  }
  // Never boot an amputated server silently: an incomplete handler means the
  // proto contract and the implementation diverged, which must fail fast.
  if (report.errors.length > 0) {
    const names = report.errors.map((entry) => `${entry.service} (${entry.reason})`).join('; ');
    throw new Error(`Refusing to start with incomplete gRPC services: ${names}`);
  }
  return report;
}

module.exports = registerAllServices;
