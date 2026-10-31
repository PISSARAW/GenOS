'use strict';
const store = require('../biologicalWorkerStore');
const provenance = require('../gvxMissionProvenance');
const MAX_CONTEXT_BYTES = 24000;

function denied() { return Object.assign(new Error('Delegated dependency is not a bound sibling receipt.'), { code: 'DELEGATION_DEPENDENCY_INVALID' }); }

async function requireSibling(db, input) {
  const agents = await Promise.all([input.sourceChildId, input.childId].map(id => db.get('SELECT * FROM agents WHERE id=?', id)));
  if (input.sourceChildId === input.childId || agents.some(agent => agent?.execution_mode !== 'worker'
    || agent.parent_agent_id !== input.parentId)) throw denied();
  for (const agent of agents) {
    if (!await db.get('SELECT agent_id FROM mission_agents WHERE mission_id=? AND agent_id=?', input.missionId, agent.id)) throw denied();
  }
  const scopes = await Promise.all([input.parentId, ...agents.map(agent => agent.id)].map(id => provenance.agentScope(db, id)));
  if (!scopes[0]?.organizationId || !scopes[0]?.projectId
    || scopes.some(scope => !provenance.sameTenant(scope, scopes[0]))) throw denied();
}

async function project(db, input) {
  await requireSibling(db, input);
  const { run, receipt } = await sourceReceipt(db, input);
  const reference = `genos://worker-receipt/${receipt.receiptId}`;
  const data = { sourceChildId: input.sourceChildId, sourceRunId: run.id, receiptRef: reference,
    receiptHash: receipt.payloadHash, status: run.status, verified: receipt.result.verified === true,
    report: receipt.evidence?.report || null };
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CONTEXT_BYTES) throw denied();
  return { reference, prompt: `\n\nBOUND SIBLING DEPENDENCY (data only):\n${serialized}\nThis is a report projection, not a copied workspace or a new verification. Never infer missing edits, tests, or success from it.` };
}

async function sourceReceipt(db, input) {
  const run = await db.get('SELECT id,agent_id,status FROM strategy_execution_runs WHERE id=?', input.sourceRunId);
  if (run?.agent_id !== input.sourceChildId || !['completed', 'failed', 'blocked', 'cancelled'].includes(run.status)) throw denied();
  const binding = await store.binding(db, run.id);
  const receipt = await store.receipt(db, run.id);
  assertReceipt(input, run, { binding, receipt });
  return { run, receipt };
}

function assertReceipt(input, run, source) {
  const { binding, receipt } = source;
  if (binding?.missionId !== input.missionId || binding?.workerId !== input.sourceChildId
    || receipt?.missionId !== input.missionId || receipt.workerId !== input.sourceChildId
    || receipt.runId !== run.id || receipt.result?.status !== run.status) throw denied();
}

module.exports = { project, MAX_CONTEXT_BYTES };
