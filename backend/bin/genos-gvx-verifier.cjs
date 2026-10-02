'use strict';

const server = require('../src/services/gvxVerifierServiceServer');

const instance = server.startServer();
instance.on('listening', () => {
  const address = instance.address();
  process.stdout.write(`GVX verifier service listening on ${address.address}:${address.port}\n`);
});
instance.on('error', (error) => {
  process.stderr.write(`GVX verifier service failed: ${error.code || error.message}\n`);
  process.exitCode = 1;
});
