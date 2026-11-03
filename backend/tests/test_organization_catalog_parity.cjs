'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ORGANIZATIONS } = require('../src/services/dynamicOrganizationService');
const source = fs.readFileSync(path.resolve(__dirname, '../../crates/genos-orchestrator/src/organization.rs'), 'utf8');
const table = source.slice(source.indexOf('pub const ORGANIZATIONS:'), source.indexOf('pub fn catalog'));
const snake = value => value.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
const rust = Object.fromEntries([...table.matchAll(/Organization\s*\{([^}]+)\}/g)].map(match => {
  const body = match[1], name = body.match(/name:\s*"([^"]+)"/)[1];
  const fields = Object.fromEntries(['topology', 'exchange', 'visibility', 'routing'].map(field =>
    [field, snake(body.match(new RegExp(`${field}:\\s*(?:\\w+::)?(\\w+)`))[1])]));
  return [name, fields];
}));
assert.deepEqual(rust, ORGANIZATIONS);
console.log('Complete Node/Rust organization catalog parity: PASS.');
