function serviceError(message, code) {
  return Object.assign(new Error(message), { code });
}

async function promoteCandidate(db, id, operatorId) {
  if (!String(operatorId || '').trim()) throw serviceError('Operator identity is required to promote an innovation', 'INNOVATION_OPERATOR_REQUIRED');
  await db.exec('BEGIN IMMEDIATE');
  try {
    const row = await db.get('SELECT candidate_genome_ref, status, evaluation_json FROM agent_genome_innovations WHERE id = ?', id);
    if (!row) throw serviceError(`innovation '${id}' not found`, 'INNOVATION_NOT_FOUND');
    if (row.status !== 'evaluated') throw serviceError('Only evaluated innovations can be promoted', 'INNOVATION_NOT_EVALUATED');
    const evaluation = parseJson(row.evaluation_json);
    if (evaluation.eligible !== true) throw serviceError('Innovation has not passed evaluation and promotion gates', 'INNOVATION_GATE_BLOCKED');
    const genome = await db.run("UPDATE agent_genomes SET status = 'active' WHERE id = ? AND status = 'candidate'", row.candidate_genome_ref);
    if (genome.changes !== 1) throw serviceError('Candidate genome is no longer promotable', 'INNOVATION_STATE_CHANGED');
    const decision = { ...evaluation, decision: { actorId: operatorId, decidedAt: new Date().toISOString() } };
    const result = await db.run("UPDATE agent_genome_innovations SET status = 'promoted', evaluation_json = ?, decision_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'evaluated'", JSON.stringify(decision), id);
    if (result.changes !== 1) throw serviceError('Innovation changed before promotion', 'INNOVATION_STATE_CHANGED');
    await recordDecision(db, {
      actor: operatorId,
      id,
      genomeRef: row.candidate_genome_ref,
      outcome: 'PROMOTED',
      decision: 'allow',
      reason: 'operator_approval'
    });
    await db.exec('COMMIT');
    return { id, status: 'promoted', candidateGenomeRef: row.candidate_genome_ref };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

async function rejectCandidate(db, id, request = {}) {
  const operatorId = String(request.operatorId || '').trim();
  if (!operatorId) throw serviceError('Operator identity is required to reject an innovation', 'INNOVATION_OPERATOR_REQUIRED');
  await db.exec('BEGIN IMMEDIATE');
  try {
    const row = await db.get('SELECT candidate_genome_ref, status FROM agent_genome_innovations WHERE id = ?', id);
    if (!row) throw serviceError(`innovation '${id}' not found`, 'INNOVATION_NOT_FOUND');
    if (!['candidate', 'evaluated'].includes(row.status)) throw serviceError('Only pending innovations can be rejected', 'INNOVATION_NOT_CANDIDATE');
    const reason = String(request.reason || 'operator_rejected');
    const decision = { decision: 'rejected', reason, actorId: operatorId, decidedAt: new Date().toISOString() };
    const genome = await db.run("UPDATE agent_genomes SET status = 'rejected' WHERE id = ? AND status = 'candidate'", row.candidate_genome_ref);
    if (genome.changes !== 1) throw serviceError('Candidate genome is no longer rejectable', 'INNOVATION_STATE_CHANGED');
    const result = await db.run("UPDATE agent_genome_innovations SET status = 'rejected', evaluation_json = ?, decision_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('candidate', 'evaluated')", JSON.stringify(decision), id);
    if (result.changes !== 1) throw serviceError('Innovation changed before rejection', 'INNOVATION_STATE_CHANGED');
    await recordDecision(db, {
      actor: operatorId,
      id,
      genomeRef: row.candidate_genome_ref,
      outcome: 'REJECTED',
      decision: 'deny',
      reason
    });
    await db.exec('COMMIT');
    return { id, status: 'rejected', candidateGenomeRef: row.candidate_genome_ref, reason };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

async function recordDecision(db, event) {
  await db.run(
    'INSERT INTO audit_logs (actor, agent_id, action, resource, decision, reason, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    event.actor, null, `GENOME_INNOVATION_${event.outcome}`, `genome-innovations/${event.id}`, event.decision, event.reason,
    JSON.stringify({ innovationId: event.id, candidateGenomeRef: event.genomeRef })
  );
}

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

module.exports = { promoteCandidate, rejectCandidate };
