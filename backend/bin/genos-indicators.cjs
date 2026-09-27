#!/usr/bin/env node
'use strict';

const { pendingEvaluation } = require('../src/services/indicatorRegistryService');

try {
  const profile = process.argv[2] || 'node-runtime';
  process.stdout.write(`${JSON.stringify(pendingEvaluation(profile), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
