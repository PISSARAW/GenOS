'use strict';

const source = require('../src/services/rhizome/telemetry/graphSourceService');

source.read({ sessionId: process.argv[2], database: process.argv[3] })
  .then(snapshot => process.stdout.write(JSON.stringify(snapshot)))
  .catch(error => { process.stderr.write(error.code || error.message); process.exitCode = 1; });
