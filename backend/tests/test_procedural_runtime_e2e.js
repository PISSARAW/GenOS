'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const runtime = require('../src/services/proceduralRuntimeService');
const persistence = require('../src/services/proceduralPersistenceService');
const identity = require('../src/services/proceduralIdentityService');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function makeParent() {
  const parent = {
    apiVersion: 'genos/v1alpha1',
    kind: 'ProceduralOrganism',
    metadata: { version: 1, parentId: null, lineageId: 'lineage-e2e' },
    structure: {
      nodes: [
        { id: 'start', type: 'action', required: true, locked: true, metadata: { action: 'inspect' } },
        { id: 'verify', type: 'gate', required: true, locked: true },
        { id: 'end', type: 'terminal', required: true },
      ],
      synapses: [
        { from: 'start', to: 'verify', type: 'excitatory', weight: 0.8 },
        { from: 'verify', to: 'end', type: 'excitatory', weight: 0.9 },
      ],
    },
    fitness: { score: 0.5, components: { success: 0.5, robustness: 0.5, evidence: 0.6, risk: 0.1, generalization: 0.4 } },
  };
  return identity.sealOrganism(parent);
}

async function testRuntimeCycle() {
  const dbPath = path.join(__dirname, `test-procedural-runtime-${Date.now()}.db`);
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);
  for (const stmt of persistence.TABLE_SQL.split(';').filter((s) => s.trim())) {
    await run(db, stmt);
  }

  // P0: parent sealed and persisted
  const parent = makeParent();
  const savedParent = await persistence.persistGenome(db, parent, { status: 'active' });
  assert.ok(savedParent.metadata.id);

  // Evolution cycle: fitness metrics favor more nodes (ADD_NODE wins), all
  // gates pass with these metrics.
  const fitnessMetrics = (variant) => ({
    success: 0.9,
    robustness: 0.8,
    evidence: 0.9,
    generalization: 0.6,
    cost: 0.2,
    risk: 0.05,
    complexity: 0.3,
  });

  const result = await runtime.runEvolutionCycle(db, savedParent, {
    variantCount: 5,
    policy: { minEvidence: 0.5, minRobustness: 0.3, maxNodes: 100 },
    fitnessMetrics,
  });

  assert.strictEqual(result.promoted, true, `cycle must promote a candidate: ${JSON.stringify(result.attempts.map((a) => ({ stage: a.stage, rejected: a.rejected, reason: a.reason })))}`);
  const p1 = result.saved;
  const p0 = savedParent;

  // Strong assertions from the review:
  assert.notStrictEqual(p1.metadata.id, p0.metadata.id, 'P1.id != P0.id');
  assert.strictEqual(p1.metadata.version, p0.metadata.version + 1, 'P1.version == P0.version + 1');
  assert.strictEqual(p1.metadata.parentId, p0.metadata.id, 'P1.parentId == P0.id');

  // Hashes: recomputed and verified
  assert.strictEqual(p1.metadata.structureHash, identity.structureHash(p1));
  assert.strictEqual(p1.metadata.stateHash, identity.stateHash(p1));
  const p1Validation = identity.validateOrganism(p1);
  assert.strictEqual(p1Validation.valid, true, `P1 must be valid: ${p1Validation.errors.join('; ')}`);

  // No critical regression: fitness components all above parent's
  assert.ok(p1.fitness.score > p0.fitness.score, `fitness(P1)=${p1.fitness.score} > fitness(P0)=${p0.fitness.score}`);
  assert.ok(p1.fitness.components.evidence >= 0.5, 'evidence >= minEvidence');

  // Immune = PASS (no findings on the promoted candidate)
  assert.strictEqual(p1.immune.rejected, false);
  assert.strictEqual(p1.immune.findings.length, 0);

  // load(P1) → exact same organism
  const loaded = await persistence.loadGenome(db, p1.metadata.id);
  assert.ok(loaded, 'P1 must be loadable');
  assert.deepStrictEqual(loaded, p1, 'load(P1) must return the exact same organism');

  // getPhylogeny(P1) → [P0, P1]
  const phylogeny = await persistence.getPhylogeny(db, p1.metadata.id);
  assert.strictEqual(phylogeny.length, 2, `phylogeny must be [P0, P1], got ${phylogeny.length}`);
  assert.strictEqual(phylogeny[0].metadata.id, p0.metadata.id);
  assert.strictEqual(phylogeny[1].metadata.id, p1.metadata.id);

  // Attempts traceability: every variant assessed, rejected ones have a stage
  assert.ok(result.attempts.length >= 1);
  for (const attempt of result.attempts) {
    assert.ok(attempt.stage, 'each attempt must record its stage');
  }

  // Second cycle from P1: the lineage keeps growing (P2 child of P1)
  const result2 = await runtime.runEvolutionCycle(db, p1, {
    variantCount: 5,
    policy: { minEvidence: 0.5, minRobustness: 0.3, maxNodes: 100 },
    fitnessMetrics,
  });
  if (result2.promoted) {
    const p2 = result2.saved;
    assert.strictEqual(p2.metadata.parentId, p1.metadata.id);
    assert.strictEqual(p2.metadata.version, p1.metadata.version + 1);
    const phylogeny2 = await persistence.getPhylogeny(db, p2.metadata.id);
    assert.strictEqual(phylogeny2.length, 3, 'phylogeny [P0, P1, P2]');
    assert.strictEqual(phylogeny2[2].metadata.id, p2.metadata.id);
  }

  db.close();
  fs.unlinkSync(dbPath);
  console.log('=== procedural runtime E2E: all passed ===');
}

testRuntimeCycle().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
