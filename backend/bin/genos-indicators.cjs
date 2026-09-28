#!/usr/bin/env node
'use strict';

const { pendingEvaluation } = require('../src/services/indicatorRegistryService');

try {
  if (process.argv[2] === 'evaluate') {
    const { evaluateReceipt } = require('../src/services/indicatorReceiptService');
    const receipt = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
    process.stdout.write(`${JSON.stringify(evaluateReceipt(receipt), null, 2)}\n`);
  } else {
    const profile = process.argv[2] || 'node-runtime';
    process.stdout.write(`${JSON.stringify(pendingEvaluation(profile), null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
