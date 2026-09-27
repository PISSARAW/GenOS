'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const service = require('../src/services/indicatorRegistryService');

const registry = service.getRegistry();
assert.equal(registry.properties.length, 14);
assert.equal(registry.families.length, 15);
const root = path.resolve(__dirname, '../..');
for (const family of registry.families) {
  for (const ref of family.sourceRefs) assert.ok(fs.existsSync(path.join(root, ref)), ref);
}

const duplicate = structuredClone(registry);
duplicate.properties.push(duplicate.properties[0]);
assert.throws(() => service.validateRegistry(duplicate), /Duplicate/);
const invalid = structuredClone(registry);
invalid.families[0].propertyIds.push('UNKNOWN');
assert.throws(() => service.validateRegistry(invalid), /Unknown property/);
assert.throws(() => service.pendingEvaluation('typo'), /Unknown indicator profile/);

for (const profile of registry.profiles) {
  const result = service.pendingEvaluation(profile.id);
  for (const entry of [...result.properties, ...result.families]) {
    assert.deepEqual(Object.values(entry.stages), Array(5).fill('not_run'));
    assert.deepEqual(entry.evidenceRefs, []);
  }
}
registry.properties.pop();
assert.equal(service.getRegistry().properties.length, 14, 'callers cannot mutate the catalog');

const cli = path.join(root, 'backend/bin/genos-indicators.cjs');
const result = spawnSync(process.execPath, [cli, 'composed-api'], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
assert.equal(JSON.parse(result.stdout).profile.inspectable, false);
const rejected = spawnSync(process.execPath, [cli, 'unknown'], { encoding: 'utf8' });
assert.equal(rejected.status, 1);
assert.equal(rejected.stdout, '');
console.log('Indicator registry: 14 properties, 15 families, four profiles; no unearned promotions.');
