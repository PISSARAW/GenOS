'use strict';
const path = require('node:path');
const assert = require('node:assert/strict');
const protocol = require('./protocol.json');
const criteria = require('./baseline-criteria.json');
for (const [key, value] of Object.entries(criteria)) assert.deepEqual(protocol[key], value, `CRITERION_CHANGED:${key}`);
module.exports = { ...protocol, sourceRoot: protocol.sourceRoot || path.resolve(__dirname, '../..'),
  repositoryRoot: protocol.repositoryRoot || path.resolve(__dirname, '../..') };
