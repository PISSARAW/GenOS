'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const router = require('../src/services/philosophyRouter');
const worlds = require('../src/services/ontology/possibleWorldService');
const { getDatabase, closeDatabase } = require('../src/db');

function assertAnalysis(result) {
  assert.strictEqual(result.result.contractVersion, 'genos.philosophy-analysis/v1');
  assert.strictEqual(result.result.promotionEligible, false);
  assert.ok(Array.isArray(result.result.evidence));
  assert.ok(result.result.uncertainty);
  assert.strictEqual(result.result.provenance.verified, false);
}

async function query(ontologyOperation, ontologyArguments) {
  return router.handlePhilosophyRequest({
    request: { operation: 'queryOntology', arguments: { ontologyOperation, ontologyArguments } },
  });
}

async function main() {
  const dbPath = path.join(os.tmpdir(), `genos-ontology-contract-${process.pid}.db`);
  process.env.GENOS_ADMIN_PASSWORD = 'ontology-analysis-contract-password';
  process.env.GENOS_ADMIN_TOKEN = 'ontology-analysis-contract-token';
  const tenantA = { organizationId: 'contract-org-a', projectId: 'contract-project-a' };
  const tenantB = { organizationId: 'contract-org-b', projectId: 'contract-project-b' };
  try {
    await getDatabase(dbPath);
    await worlds.createWorld({ worldId: 'contract-world-a', assumptions: [{ key: 'budget', value: 1 }], ...tenantA });
    await worlds.createWorld({ worldId: 'contract-world-b', assumptions: [{ key: 'budget', value: 2 }], ...tenantA });

    const comparison = await query('comparePossibleWorlds', { worldA: 'contract-world-a', worldB: 'contract-world-b', ...tenantA });
    assertAnalysis(comparison);
    assert.strictEqual(comparison.result.evidenceStatus, 'unverified');

    await assert.rejects(
      () => worlds.addAccessibility({ sourceWorldId: 'contract-world-a', targetWorldId: 'missing', ...tenantA }),
      /Unknown possible world/
    );
    const receipt = await worlds.createReceipt({ worldId: 'contract-world-a', outcome: { value: 1 }, ...tenantA });
    await assert.rejects(
      () => worlds.verifyReceipt({ receiptId: receipt.receiptId, ...tenantB }),
      /Unknown world receipt/
    );
    const db = await getDatabase(dbPath);
    await db.run('UPDATE ontology_world_receipts SET payload_json = ? WHERE id = ?', '{"tampered":true}', receipt.receiptId);
    assert.strictEqual((await worlds.verifyReceipt({ receiptId: receipt.receiptId, ...tenantA })).status, 'invalid');

    const causal = await query('evaluateCausalDependence', {
      worldId: 'contract-world-a', causeAgent: 'agent-a', effectAgent: 'agent-b',
      actualOutcome: 'completed', counterfactualOutcome: 'blocked',
      modalFormula: 'p', modalModel: {
        worlds: ['w0'], actualWorld: 'w0', accessibility: [['w0', 'w0']], valuation: { w0: { p: true } },
      },
      ...tenantA,
    });
    assertAnalysis(causal);
    assert.strictEqual(causal.result.worldReference.hypothetical, true);
    assert.strictEqual(causal.result.modalEvaluation.value, true);
    assert.strictEqual(causal.result.epistemic_context.promotionEligible, false);
    console.log('Ontology analysis contract: scope, receipt integrity and causal-modal bridge passed');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) { /* best effort cleanup */ }
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
