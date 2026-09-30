'use strict';

const assert = require('node:assert/strict');
const dbModule = require('../src/db');

function createDatabase() {
  const state = { decisions: [], provenance: [] };
  const db = {
    state,
    async get(sql, ...args) {
      if (!sql.includes('FROM provenance_records')) return null;
      return state.provenance.find((row) => row.payload_hash === args[0]
        && row.organization_id === (args[1] || null)
        && row.project_id === (args[2] || null)) || null;
    },
    async run(sql, ...args) {
      if (sql.includes('INSERT INTO genome_decisions')) {
        state.decisions.push({ id: args[0], title: args[1], content: args[2], evidence_refs_json: args[7], evidence_status: args[8] });
      }
      if (sql.includes('INSERT INTO provenance_records')) {
        state.provenance.push({ id: args[0], subject_type: args[1], subject_id: args[2], payload_hash: args[3], parent_hash: args[4], payload_json: args[5], organization_id: args[6], project_id: args[7] });
      }
      if (sql.includes('UPDATE genome_decisions')) {
        const row = state.decisions.find((item) => item.id === args[2]);
        Object.assign(row, { provenance_record_id: args[0], provenance_hash: args[1] });
      }
    }
  };
  return db;
}

function response() {
  let result;
  return {
    res: { status: (code) => ({ json: (body) => { result = { code, body }; } }) },
    get: () => result
  };
}

async function callRecord(controller, body) {
  const output = response();
  await controller.recordDecision({ body, tenant: { organizationId: 'org-a', projectId: 'project-a' } }, output.res);
  return output.get();
}

async function main() {
  const originalGetDatabase = dbModule.getDatabase;
  const db = createDatabase();
  dbModule.getDatabase = async () => db;
  const observationPath = require.resolve('../src/services/evaluationObservabilityService');
  delete require.cache[observationPath];
  delete require.cache[require.resolve('../src/services/decisionEvidenceService')];
  delete require.cache[require.resolve('../src/controllers/lineageController')];
  const controller = require('../src/controllers/lineageController');
  const evidenceHash = 'a'.repeat(64);
  db.state.provenance.push({ id: 'prov-evidence', payload_hash: evidenceHash, organization_id: 'org-a', project_id: 'project-a' });

  try {
    const linked = await callRecord(controller, { title: 'Adopt snapshot binding', content: 'The state restore now includes workspace files.', evidenceRefs: [evidenceHash] });
    assert.equal(linked.code, 201);
    assert.equal(linked.body.evidenceStatus, 'linked');
    assert.deepEqual(linked.body.evidenceRefs, [evidenceHash]);
    const decisionProof = db.state.provenance.find((row) => row.subject_id === linked.body.id);
    assert.equal(decisionProof.parent_hash, evidenceHash);
    assert.equal(decisionProof.payload_hash, linked.body.provenanceHash);
    assert.equal(db.state.decisions[0].provenance_hash, linked.body.provenanceHash);

    const provisional = await callRecord(controller, { title: 'Track open question', content: 'Independent validation is pending.' });
    assert.equal(provisional.body.evidenceStatus, 'provisional');
    assert.deepEqual(provisional.body.evidenceRefs, []);

    const rejected = await callRecord(controller, { title: 'Out of scope evidence', content: 'This must not attach another tenant proof.', evidenceRefs: ['b'.repeat(64)] });
    assert.equal(rejected.code, 400);
    assert.equal(rejected.body.error.code, 'DECISION_EVIDENCE_NOT_FOUND');
    const invalid = await callRecord(controller, { title: 'Invalid reference', content: 'A label is not a proof hash.', evidenceRefs: ['receipt-1'] });
    assert.equal(invalid.body.error.code, 'DECISION_EVIDENCE_INVALID');
    assert.equal(db.state.decisions.length, 2);
    console.log('Decision and evidence binding contract passed.');
  } finally {
    dbModule.getDatabase = originalGetDatabase;
    delete require.cache[require.resolve('../src/services/evaluationObservabilityService')];
    delete require.cache[require.resolve('../src/services/decisionEvidenceService')];
    delete require.cache[require.resolve('../src/controllers/lineageController')];
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
