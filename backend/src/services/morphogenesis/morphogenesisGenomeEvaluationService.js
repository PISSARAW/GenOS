'use strict';

const innovation = require('../agentDnaInnovation');
const store = require('../agentDnaStore');

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

async function innovationContext(db, innovationId) {
  const row = await db.get('SELECT * FROM agent_genome_innovations WHERE id = ?', innovationId);
  if (!row) throw coded('INNOVATION_NOT_FOUND', `Innovation '${innovationId}' not found.`);
  if (row.status !== 'candidate') {
    throw coded('INNOVATION_NOT_CANDIDATE', 'Only a candidate innovation can receive outcome evidence.');
  }
  const candidate = await store.loadGenome(db, row.candidate_genome_ref);
  const parent = await store.loadGenome(db, row.base_genome_ref);
  if (!candidate || !parent) {
    throw coded('MORPHOGENESIS_GENOME_LINEAGE_UNAVAILABLE', 'Candidate or parent genome is unavailable.');
  }
  return { row, candidate, parent };
}

async function evaluateFromVerifiedOutcome(db, request) {
  const context = await innovationContext(db, request.innovationId);
  const evidence = {
    source: 'morphogenesis_paired_outcome',
    missionId: request.missionId,
    outcomeId: request.outcomeId,
    candidateContentHash: context.candidate.contentHash,
    parentContentHash: context.parent.contentHash
  };
  const saved = await db.run(`UPDATE agent_genome_innovations SET evidence_json = ?
    WHERE id = ? AND status = 'candidate'`, JSON.stringify(evidence), request.innovationId);
  if (saved.changes !== 1) {
    throw coded('INNOVATION_STATE_CHANGED', 'Innovation changed before evidence binding.');
  }
  return innovation.evaluateCandidate(db, request.innovationId);
}

module.exports = { evaluateFromVerifiedOutcome, innovationContext };
