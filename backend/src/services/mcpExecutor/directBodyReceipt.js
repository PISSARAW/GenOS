'use strict';

async function begin(input) {
  const { db, toolName, actor } = input;
  if (!actor) return null;
  if (!actor.agentId || !actor.runId) throw new TypeError('Direct MCP actor requires agentId and runId.');
  const authority = require('../missionEnvelopeAuthority');
  const binding = await authority.assertRun(db, { agentId: actor.agentId, runId: actor.runId });
  if (binding.status !== 'authorized') throw new Error('Direct MCP actor has no bound authority.');
  const toolBinding = await authority.assertTool(db, { agentId: actor.agentId, toolName });
  if (toolBinding.status !== 'authorized' || toolBinding.envelope.runId !== actor.runId) {
    throw Object.assign(new Error('Direct MCP actor run is not the current tool authority.'), {
      code: 'BODY_ACTION_AUTHORITY_REQUIRED'
    });
  }
  const receipts = require('../bodyActionReceiptService');
  const actionId = receipts.actionId();
  await receipts.predict({ db, agentId: actor.agentId, runId: actor.runId,
    actionId, effectorId: 'direct_mcp_call', prediction: { toolName, expected: 'tool_result' } });
  return { agentId: actor.agentId, runId: actor.runId, actionId };
}

async function finish(input) {
  const { db, toolName, receipt, outcome } = input;
  if (receipt) await require('../bodyActionReceiptService').observe({ db, ...receipt,
    effectorId: 'direct_mcp_call', outcome });
  await audit({ db, toolName, receipt, action: 'MCP_DIRECT_RESULT', decision: outcome.status });
}

async function audit(input) {
  const { db, toolName, receipt, action, decision } = input;
  await db.run(`INSERT INTO audit_logs (actor, agent_id, action, resource, decision, reason, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, receipt ? 'agent' : 'mcp-direct', receipt?.agentId || null,
  action, toolName, decision, receipt ? 'sealed agent action' : 'external or unattributed call',
  JSON.stringify({ sourceActionId: receipt?.actionId || null }));
}

module.exports = { begin, finish, audit };
