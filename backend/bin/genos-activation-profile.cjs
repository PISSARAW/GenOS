'use strict';

const { inspect } = require('../src/services/activationProfiles');

try {
  const result = inspect({ profile: process.argv[2] || 'observe' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.dependenciesReady ? 0 : 2;
} catch (error) { console.error(error.message); process.exitCode = 1; }
