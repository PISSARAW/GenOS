'use strict';

const server = require('../../src/services/gvxVerifierServiceServer').startServer({ port: 0 });
server.once('listening', () => process.send({ port: server.address().port }));
process.on('message', (message) => {
  if (message === 'close') server.close(() => process.exit(0));
});
