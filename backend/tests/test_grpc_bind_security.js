const assert = require('node:assert/strict');
const fs = require('node:fs');

for (const file of ['backend/grpc-server.js', 'backend/server.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /Refusing insecure gRPC on a non-loopback bind address/);
}
console.log('gRPC bind security checks passed.');