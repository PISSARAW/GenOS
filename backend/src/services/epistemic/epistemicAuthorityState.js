'use strict';

const { withTransaction } = require('../../db');
const apoptosis = require('./epistemicApoptosisService');
const { readAssembly } = require('../aeisAssemblyStore');

async function accumulate(db, input) {
  if (!input.agentId || !input.eventId) throw new Error('AEIS authority requires an agent and an evidence event.');
  return withTransaction(db, async () => {
    const agent = await db.get('SELECT id, name, status FROM agents WHERE id = ?', input.agentId);
    if (!agent) return { ok: false, reason: 'agent_not_found' };
    const previous = await db.get('SELECT * FROM aeis_agent_dissonance WHERE agent_id = ?', input.agentId);
    const delta = apoptosis.dissonanceFrom(input.signals);
    const event = await db.run('INSERT OR IGNORE INTO aeis_dissonance_events (agent_id, event_id, delta) VALUES (?, ?, ?)',
      input.agentId, input.eventId, delta);
    const dissonance = (previous?.dissonance || 0) + (event.changes ? delta : 0);
    const level = apoptosis.niveauCorpsent(dissonance);
    const autopsy = level >= apoptosis.NIVEAUX.apoptosis
      ? apoptosis.autopsy({ ...agent, epistemicDissonance: dissonance }, 'epistemic_dissonance', [input.eventId]) : null;
    await db.run(`INSERT INTO aeis_agent_dissonance (agent_id, dissonance, authority_level, autopsy_json)
      VALUES (?, ?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET
      dissonance = excluded.dissonance, authority_level = excluded.authority_level,
      autopsy_json = COALESCE(autopsy_json, excluded.autopsy_json), updated_at = CURRENT_TIMESTAMP`,
    input.agentId, dissonance, level, autopsy ? JSON.stringify(autopsy) : null);
    await enforceState(db, agent.id, level);
    return { ok: true, dissonance, level, autopsy, recorded: event.changes === 1 };
  });
}

async function enforceState(db, agentId, level) {
  if (level < apoptosis.NIVEAUX.quarantine) return;
  const status = level >= apoptosis.NIVEAUX.apoptosis ? 'apoptosis' : 'blocked';
  const changed = await db.run("UPDATE agents SET status = ?, isolation_mode = 'Quarantine', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    status, agentId);
  if (changed.changes !== 1) throw new Error('AEIS authority update did not affect the expected agent.');
}

async function assertAuthority(db, agentId, options = {}) {
  const state = await db.get('WITH RECURSIVE lineage(id,parent_agent_id) AS ('
    + 'SELECT id,parent_agent_id FROM agents WHERE id=? '
    + 'UNION SELECT a.id,a.parent_agent_id FROM agents a JOIN lineage child ON a.id=child.parent_agent_id) '
    + 'SELECT MAX(s.authority_level) AS authority_level FROM lineage a JOIN aeis_agent_dissonance s ON s.agent_id=a.id', agentId);
  const threshold = options.dispatch === true ? apoptosis.NIVEAUX.reduced_authority : apoptosis.NIVEAUX.quarantine;
  if ((state?.authority_level || 0) >= threshold) {
    throw Object.assign(new Error('AEIS has reduced or revoked this agent execution authority.'), { code: 'AEIS_AUTHORITY_REVOKED' });
  }
}

async function observeEvaluation(db, input) {
  if (!input.evaluation?.persistedAssemblyId) return [];
  const run = await db.get('SELECT agent_id FROM strategy_execution_runs WHERE id = ?', input.runId);
  if (run?.agent_id !== input.agentId) throw new Error('AEIS feedback agent does not own the run.');
  const saved = await readAssembly(db, input.evaluation.persistedAssemblyId);
  if (saved.runId !== input.runId || saved.scopeId !== input.scopeId) throw new Error('AEIS feedback scope mismatch.');
  const states = [];
  for (const result of saved.evaluation.assembly.results) {
    const eventId = `${input.runId}:${result.resultId}`;
    const outcome = await db.get('SELECT outcome FROM epistemic_immune_outcomes WHERE scope_id = ? AND evidence_id = ?',
      input.scopeId, eventId);
    if (outcome?.outcome !== 'failure') continue;
    const authorityEvent = input.runId + ':' + require('./immuneMemoryService').signatureFrom(result.canonicalStatement);
    states.push(await accumulate(db, { agentId: input.agentId, eventId: authorityEvent, signals: [1] }));
  }
  return states;
}

module.exports = { accumulate, assertAuthority, observeEvaluation };
