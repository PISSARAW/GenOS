'use strict';

const assert = require('node:assert/strict');
const { fetchCorpus } = require('../src/services/vectorMemoryCorpus');
const { mergeGraphMemory } = require('../src/services/vectorMemoryService');

async function verifyHydratedReferences() {
  const record = {
    id: 'memory-linked', title: 'Linked memory', category: 'Experience',
    content: 'A durable observation.', created_by: 'agent', created_at: '2026-10-15',
    synaptic_weight: 1, evidence_refs_json: JSON.stringify(['sha256:source-proof']),
    evidence_status: 'linked', provenance_record_id: 'prov-17', provenance_hash: 'sha256:prov-hash'
  };
  const db = { all: async (sql) => String(sql).includes('FROM genome_decisions') ? [record] : [] };
  const items = await fetchCorpus(db, '', null, { organizationId: 'org', projectId: 'project' });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].evidenceRefs, ['sha256:source-proof']);
  assert.deepEqual(items[0].provenance,
    { recordId: 'prov-17', hash: 'sha256:prov-hash', status: 'linked' });
}

function verifyGraphMerge() {
  const merged = mergeGraphMemory({ id: 'n1', tags: ['graph_association'],
    synaptic_edge_weight: 0.7, similarityScore: 0.4, inhibitorySignal: 'stale' },
  { id: 'n1', tags: ['genome', 'Experience'], evidenceRefs: ['sha256:proof'],
    provenance: { recordId: 'prov-17' }, similarityScore: 0.9, inhibitorySignal: 'active' });
  assert.deepEqual(merged.tags, ['graph_association', 'genome', 'Experience']);
  assert.equal(merged.synaptic_edge_weight, 0.7);
  assert.equal(merged.similarityScore, 0.9);
  assert.equal(merged.inhibitorySignal, 'active');
  assert.deepEqual(merged.evidenceRefs, ['sha256:proof']);
  assert.deepEqual(merged.provenance, { recordId: 'prov-17' });
}

verifyHydratedReferences().then(() => {
  verifyGraphMerge();
  console.log('Vector memory hydration preserves persisted evidence provenance.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
