'use strict';
const fs = require('node:fs');

function normalizeActionResult(result) {
  if (!result || typeof result !== 'object') return { success: false, status: 'invalid_result', error: 'MCP action returned no structured outcome.' };
  return { ...result, success: result.success === true && result.isError !== true };
}

function outputObject(result) {
  if (result.data && typeof result.data === 'object') return result.data;
  if (result.output && typeof result.output === 'object') return result.output;
  if (typeof result.output !== 'string') return result;
  try { return JSON.parse(result.output); } catch (_) { return null; }
}

function snapshotProof(args) {
  try {
    const snapshot = JSON.parse(fs.readFileSync(args.out, 'utf8'));
    return Boolean(snapshot.snapshot_id && snapshot.agent_id && snapshot.branch_id && snapshot.world_id && snapshot.state);
  } catch (_) { return false; }
}

function verifiedResult(context, args, input) {
  const result = normalizeActionResult(input);
  if (!result.success) return result;
  const output = outputObject(result);
  if (output?.success === false) return { ...result, success: false, status: 'domain_failed', error: 'Tool transport succeeded but its result failed.' };
  const validators = {
    genos_snapshot: () => snapshotProof(args),
    genos_replay: () => output?.success === true && output.replay_status === 'VERIFIED' && output.execution_replayed === true,
    genos_record_experience: () => Boolean(output?.episodeId),
    genos_execute_primitive: () => output?.success === true,
    genos_parasitic_pressure: () => output?.success === true
  };
  const validate = validators[context.decision.tool];
  if (validate && !validate()) return { ...result, success: false, status: 'missing_action_proof', error: 'The action returned no required typed receipt.' };
  return { ...result, proof: output };
}

module.exports = { normalizeActionResult, verifiedResult, outputObject };
