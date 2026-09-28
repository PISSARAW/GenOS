'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const qdProxyRoutes = require('../src/routes/qdProxyRoutes');

async function run() {
  const app = express();
  app.use('/api/qd', qdProxyRoutes);
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/qd/proxy`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'QD_ARCHIVE_NOT_CONNECTED',
        message: 'Aucune archive QD runtime n’est connectée à ce proxy.'
      }
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
