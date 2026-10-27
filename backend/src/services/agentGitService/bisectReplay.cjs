'use strict';

const { getDatabase } = require('./agentGitDb.cjs');
const { buildCausalPath } = require('./bisect.cjs');
const { verifySource } = require('./verifiedMerge.cjs');
const { runProbe, configuredProbe } = require('./replayProbeRunner.cjs');

async function bisectReplay(req) {
  const { goodObjectId, badObjectId, probeName, fixtures } = req.body || {};
  if (!goodObjectId || !badObjectId || !probeName) {
    return { success: false, error: 'goodObjectId, badObjectId and probeName are required.' };
  }
  configuredProbe(probeName);
  const db = await getDatabase();
  const scope = require('./scopeSql.cjs').scopeSql(req, 'w');
  const query = `SELECT o.id, o.agent_id, o.workspace_id FROM agent_git_objects o
    LEFT JOIN workspaces w ON w.id = o.workspace_id WHERE o.id = ? AND ${scope.clause}`;
  const [good, bad] = await Promise.all([db.get(query, goodObjectId, ...scope.params),
    db.get(query, badObjectId, ...scope.params)]);
  if (!good || !bad || good.agent_id !== bad.agent_id || good.workspace_id !== bad.workspace_id) {
    return { success: false, error: 'Both checkpoints must belong to the same scoped agent.' };
  }
  const path = await buildCausalPath(db, goodObjectId, badObjectId);
  if (!path || path.length < 2 || path.length > 64 || !path.some((item) => item.id === goodObjectId)) {
    return { success: false, error: 'A causal path of 2 to 64 checkpoints is required.' };
  }
  if (path.some((item) => item.agent_id !== good.agent_id || item.workspace_id !== good.workspace_id)) {
    return { success: false, error: 'Causal path crosses an agent or workspace boundary.' };
  }
  const issues = path.flatMap(verifySource);
  if (issues.length) return { success: false, error: 'Checkpoint verification failed.', issues };
  const segment = path.slice(path.findIndex((item) => item.id === goodObjectId));
  const probes = [];
  for (const checkpoint of segment) {
    const result = await runProbe({ name: probeName, state: JSON.parse(checkpoint.state_json), fixtures,
      seed: checkpoint.state_hash, now: checkpoint.created_at });
    probes.push({ objectId: checkpoint.id, ...result });
  }
  const baseline = probes.find((probe) => probe.objectId === goodObjectId);
  const terminal = probes.find((probe) => probe.objectId === badObjectId);
  if (!baseline.pass || terminal.pass) {
    return { success: false, error: 'Good checkpoint must pass and bad checkpoint must fail.', probes };
  }
  const firstFailure = probes.findIndex((probe) => probe.pass === false);
  return { success: true, operation: 'bisect-replay', executionMode: 'trusted_probe_process',
    runtimeReplayed: false, checkpointTestExecuted: true, probeName, goodObjectId, badObjectId, probes,
    culpritObjectId: probes[firstFailure].objectId };
}

module.exports = { bisectReplay };
