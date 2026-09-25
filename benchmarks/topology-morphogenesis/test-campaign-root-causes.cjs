'use strict';

const assert = require('node:assert/strict');
const { verifySimpleMissionProof } = require('./simpleMissionProof.cjs');
const { missingGraphItems } = require('./session-probes.cjs');
const { installBusyRetry } = require('../../backend/src/db');

function receiptFor(statement) {
  return { telemetry: [{ event_type: 'EVIDENCE_REPORT', payload_json: JSON.stringify({
    evidenceReport: { claims: [{ statement }] }
  }) }] };
}

async function verifyDatabaseRetry() {
  const db = { attempts: 0, async run() {
    this.attempts += 1;
    if (this.attempts === 1) throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    return 'saved';
  } };
  installBusyRetry(db);
  assert.equal(await db.run('INSERT'), 'saved');
  assert.equal(db.attempts, 2);
}

async function main() {
  const latex = '24 - 3 = 21; 21 \\div 7 = 3; 21 \\mod 7 = 0; il n’y a pas de reste.';
  const proof = verifySimpleMissionProof(receiptFor(latex), 'orchestrateur-simple');
  assert.equal(proof.verified, true);
  assert.equal(verifySimpleMissionProof(receiptFor(latex.replace('= 0', '= 1')),
    'orchestrateur-simple').verified, false);

  const graph = {
    nodes: [{ nodeId: 'json-parser' }],
    edges: [{ edgeId: 'parser-validator' }]
  };
  const desiredNodes = [{ nodeId: 'json-parser' }, { nodeId: 'schema-validator' }];
  const desiredEdges = [{ edgeId: 'parser-validator' }, { edgeId: 'validator-explainer' }];
  assert.deepEqual(missingGraphItems(graph, desiredNodes, desiredEdges), {
    nodes: [{ nodeId: 'schema-validator' }],
    edges: [{ edgeId: 'validator-explainer' }]
  });
  await verifyDatabaseRetry();
  process.stdout.write('Campaign root-cause checks passed.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
