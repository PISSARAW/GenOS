const assert = require('node:assert/strict');
const immuneSystem = require('../src/services/immuneSystem');
delete require.cache[require.resolve('../src/grpc_services/securityService')];
const security = require('../src/grpc_services/securityService');

const original = immuneSystem.scanThreats;
immuneSystem.scanThreats = () => { throw new Error('scanner unavailable'); };

(async () => {
  await new Promise((resolve, reject) => security.ScanVulnerabilities({ request: { target: 'x' } }, (error, value) => {
    try { assert.equal(error.code, 13); assert.equal(value, undefined); resolve(); } catch (e) { reject(e); }
  }));
  immuneSystem.scanThreats = original;
  console.log('Security gRPC propagates immune scan failures.');
})().catch((error) => { immuneSystem.scanThreats = original; console.error(error); process.exitCode = 1; });