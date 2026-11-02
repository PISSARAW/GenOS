'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const values = require('./evidenceValues');

async function accepted(ctx) {
  const binding = ctx.protocolBinding;
  await require('./context').assertCurrent(binding);
  const run = await ctx.db.get('SELECT agent_id,status FROM strategy_execution_runs WHERE id=?', ctx.executionRun.id);
  if (run?.agent_id !== ctx.agentId || run.status !== 'completed') return null;
  const table = await ctx.db.get("SELECT name FROM sqlite_master WHERE name='mission_protocol_evidence'");
  if (!table) return null;
  const row = await ctx.db.get('SELECT * FROM mission_protocol_evidence WHERE run_id=?', ctx.executionRun.id);
  if (!row) return null;
  const dossier = JSON.parse(row.dossier_json);
  validateDossier(binding, { dossier, row });
  const conversation = require('./evidence').conversation(binding, null);
  try {
    if (!conversation.canPromote(values.request(binding, dossier.claim))) return null;
    await require('./context').assertCurrent(binding);
    return { runId: binding.runId, status: run.status, dossierDigest: row.dossier_digest };
  } finally { conversation.close(); }
}

function validateDossier(binding, input) {
  const { dossier, row } = input;
  const expected = [binding.runId, binding.missionId, binding.scope, binding.agentId];
  const actual = [dossier.runId, dossier.missionId, dossier.scope, dossier.claim.provenance.producerId];
  if (digest(dossier) !== row.dossier_digest || digest(actual) !== digest(expected)) {
    throw new Error('WINDOWS_NATIVE_COMPLETION_DOSSIER_MISMATCH');
  }
}

async function qualify(ctx, result) {
  if (!result?.started || result.unresolved === true) return result;
  const receipt = await accepted(ctx);
  return receipt ? { ...result, nativeCompletion: receipt }
    : { ...result, unresolved: true, reason: 'WINDOWS_NATIVE_COMPLETION_REQUIRED' };
}

module.exports = { qualify };
