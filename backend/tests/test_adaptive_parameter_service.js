const assert = require('assert');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { closeDatabase, getDatabase } = require('../src/db');
const adaptive = require('../src/services/adaptiveParameterService');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'adaptive-test-password';

test('adaptive parameters learn from observations and survive reload', async () => {
  const dbPath = path.join(__dirname, `adaptive-${Date.now()}.db`);
  try {
    await getDatabase(dbPath);
    for (let i = 0; i < 3; i++) {
      await adaptive.observe('quorum.threshold', { signal: 0.8, success: true }, 'test');
    }
    const tuned = adaptive.currentValue('quorum.threshold', 'test');
    assert(tuned > 0.5 && tuned <= 0.8);
    assert.equal(adaptive.currentValue('quorum.threshold', 'global'), 0.5);
    await closeDatabase();
    await getDatabase(dbPath);
    const loaded = await adaptive.load('test');
    assert.equal(loaded['quorum.threshold'], tuned);
    assert(tuned >= 0.35 && tuned <= 0.9);
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {}
    }
  }
});

test('route weights remain normalized and bounded after observations', async () => {
  for (let i = 0; i < 3; i++) {
    await adaptive.observeRoute('test-route', { route: 'beta', quality: 0.9, success: true });
  }
  const weights = adaptive.routeWeights('test-route');
  assert(Math.abs(weights.alpha + weights.beta + weights.gamma - 1) < 1e-9);
  assert(weights.alpha >= 0.08 && weights.beta >= 0.08);
  assert.equal(weights.gamma, 0.2);
});