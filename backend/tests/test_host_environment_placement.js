'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const host = require('../src/services/hostEnvironment');
const placement = require('../src/storage/storagePlacement');

function isNullOrNumber(value) {
  return value === null || typeof value === 'number';
}

function baseProfile(overrides) {
  return Object.assign({
    cpuCount: 8,
    load1m: 1,
    totalMemoryBytes: 8 * 1024 ** 3,
    freeMemoryBytes: 6 * 1024 ** 3,
    pressure: { cpu: null, memory: 0, io: 0 },
    volume: { path: os.tmpdir(), totalBytes: 100 * 1024 ** 3, availableBytes: 60 * 1024 ** 3, freeRatio: 0.6 },
    volumes: [],
    alternativeVolume: null
  }, overrides || {});
}

function checkState(profile, expectedState, expectedReason) {
  const policy = host.deriveAdaptivePolicy(profile);
  assert.equal(policy.state, expectedState);
  assert.ok(policy.reasons.includes(expectedReason));
  assert.equal(policy.maxWorkers, 1);
  return policy;
}

const live = host.readHostEnvironment({ dataPath: os.tmpdir() });
assert.ok(live.observedAt);
assert.ok(live.platform);
assert.ok(live.architecture);
assert.ok(Number.isSafeInteger(live.cpuCount) && live.cpuCount > 0);
assert.ok(isNullOrNumber(live.load1m));
assert.ok(isNullOrNumber(live.pressure.cpu));
assert.ok(isNullOrNumber(live.pressure.memory));
assert.ok(isNullOrNumber(live.pressure.io));
assert.ok(live.volume === null || typeof live.volume.path === 'string');
assert.ok(Array.isArray(live.volumes));
if (process.platform !== 'linux') {
  assert.equal(live.pressure.cpu, null);
  assert.equal(live.pressure.memory, null);
  assert.equal(live.pressure.io, null);
}
if (process.platform === 'win32') {
  assert.equal(live.load1m, null);
}

const normal = host.deriveAdaptivePolicy(baseProfile());
assert.equal(normal.state, 'normal');
assert.deepEqual(normal.reasons, []);
assert.equal(normal.allowBackgroundGrowth, true);
assert.equal(normal.suggestedDataVolume, null);

checkState(baseProfile({ freeMemoryBytes: 0.5 * 1024 ** 3 }), 'constrained', 'memory_capacity');
checkState(baseProfile({ pressure: { cpu: null, memory: 25, io: 0 } }), 'constrained', 'memory_stall');
checkState(baseProfile({ pressure: { cpu: null, memory: 0, io: 42 } }), 'constrained', 'io_stall');
checkState(baseProfile({ load1m: 7.5 }), 'constrained', 'cpu_load');

const lowDisk = baseProfile({ volume: { path: os.tmpdir(), totalBytes: 10 * 1024 ** 3, availableBytes: 100, freeRatio: 0.001 } });
const critical = checkState(lowDisk, 'critical', 'disk_capacity');
assert.equal(critical.suggestedDataVolume, null);

const unknownVolume = host.deriveAdaptivePolicy(baseProfile({ volume: null }));
assert.equal(unknownVolume.state, 'critical');
assert.ok(unknownVolume.reasons.includes('volume_unknown'));

const withAlt = baseProfile({ volume: { path: os.tmpdir(), totalBytes: 10 * 1024 ** 3, availableBytes: 100, freeRatio: 0.001 } });
withAlt.alternativeVolume = { path: os.tmpdir(), availableBytes: 50 * 1024 ** 3 };
const relief = host.deriveAdaptivePolicy(withAlt);
assert.equal(relief.state, 'critical');
assert.equal(relief.suggestedDataVolume, os.tmpdir());

assert.throws(() => placement.chooseDataRoot({ GENOS_DATA_ROOT: 'relative/path' }), /accessible absolute/);
assert.throws(() => placement.chooseDataRoot({ GENOS_DATA_ROOT: path.join(path.parse(os.tmpdir()).root, 'genos-definitely-missing-xyz') }), /(accessible absolute|offline migration)/);

const defaultRoot = placement.DEFAULT_ROOT;
if (fs.existsSync(defaultRoot)) {
  const existing = placement.chooseDataRoot({ GENOS_DATA_ROOT: '', GENOS_STORAGE_CANDIDATES: '', GENOS_STORAGE_MIN_FREE_BYTES: '' });
  assert.equal(existing.root, defaultRoot);
  assert.equal(existing.reason, 'existing');
  assert.throws(() => placement.chooseDataRoot({ GENOS_DATA_ROOT: os.tmpdir() }), /offline migration/);
} else {
  const selected = placement.selectCandidate({ GENOS_STORAGE_CANDIDATES: '', GENOS_STORAGE_MIN_FREE_BYTES: '' });
  assert.ok(selected === null || typeof selected.root === 'string');
}

const probe = placement.selectCandidate({ GENOS_STORAGE_CANDIDATES: '', GENOS_STORAGE_MIN_FREE_BYTES: String(1024 ** 3) });
assert.ok(probe === null || (typeof probe.root === 'string' && probe.volume));

console.log('Host environment placement checks passed.');
