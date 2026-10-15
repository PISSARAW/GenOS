'use strict';

const fs = require('node:fs');
const { closeDatabase } = require('../../src/db');
const cli = require('../../src/services/genosCli');
const originalRunGenos = cli.runGenos;

cli.runGenos = async (...args) => {
  fs.appendFileSync(process.env.SENSORY_CLI_INVOCATION_LOG, `${JSON.stringify(args[0])}\n`);
  return originalRunGenos(...args);
};

const server = require('../../src/app').createApp().listen(0, '127.0.0.1');
server.once('listening', () => process.send({ ready: true, port: server.address().port }));
process.once('message', message => {
  if (message?.type !== 'close') return;
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
});

process.on('uncaughtException', error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
