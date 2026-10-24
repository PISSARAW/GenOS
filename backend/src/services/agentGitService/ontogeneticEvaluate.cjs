'use strict';

const { getDatabase } = require('./agentGitDb.cjs');
const { verifySource } = require('./verifiedMerge.cjs');
const { runProbe, configuredProbe } = require('./replayProbeRunner.cjs');
const { compareIdentity, compareCapabilities, summarizeRuns } = require('./ontogeneticOps.cjs');

function validateInput(body) {
  const names = body?.probeNames;
  if (!body?.baselineObjectId || !body?.candidateObjectId || !Array.isArray(names)
    || !names.length || names.length > 8 || new Set(names).size !== names.length
    || names.some((name) => typeof name !== 'string')) {
    throw new Error('Two object IDs and one to eight distinct registered probe names are required.');
  }
  names.forEach(configuredProbe);
  const now = body.now || '1970-01-01T00:00:00.000Z';
  if (Number.isNaN(Date.parse(now))) throw new Error('now must be an ISO timestamp.');
  return { names, now, fixtures: body.fixtures || {}, seed: String(body.seed || 'ontogenetic-pair') };
}

async function loadPair(db, req) {
  const scope = require('./index').scopeSql(req, 'w');
  const sql = `SELECT o.* FROM agent_git_objects o LEFT JOIN workspaces w ON w.id = o.workspace_id
    WHERE o.id = ? AND ${scope.clause}`;
  const baseline = await db.get(sql, req.body.baselineObjectId, ...scope.params);
  const candidate = await db.get(sql, req.body.candidateObjectId, ...scope.params);
  if (!baseline || !candidate) throw new Error('Both commits must exist in the current tenant.');
  const child = await db.get('SELECT parent_agent_id FROM agents WHERE id = ?', candidate.agent_id);
  if (candidate.agent_id !== baseline.agent_id && child?.parent_agent_id !== baseline.agent_id) {
    throw new Error('Candidate must belong to the baseline agent or its direct fork.');
  }
  const issues = [baseline, candidate].flatMap(verifySource);
  if (issues.length) throw new Error(`Snapshot verification failed: ${JSON.stringify(issues)}`);
  return { baseline, candidate };
}

async function runPairedProbes(states, config) {
  const pairs = [];
  for (const name of config.names) {
    const common = { name, fixtures: config.fixtures[name] || {}, seed: config.seed, now: config.now };
    const baseline = await runProbe({ ...common, state: states.baseline });
    const candidate = await runProbe({ ...common, state: states.candidate });
    pairs.push({ name, baseline, candidate });
  }
  return pairs;
}

function summarize(states, probes) {
  const identity = compareIdentity(states.baseline.agent || {}, states.candidate.agent || {});
  const capabilities = compareCapabilities(states.baseline.plasmids, states.candidate.plasmids);
  const execution = { baseline: summarizeRuns(states.baseline.runs),
    candidate: summarizeRuns(states.candidate.runs) };
  const passed = (side) => probes.filter((pair) => pair[side].pass).length;
  return { identity, capabilities, execution, probes,
    taskPerformance: { baselinePassed: passed('baseline'), candidatePassed: passed('candidate'),
      commonTasks: probes.length },
    selection: 'not_performed', runtimeReplayed: false };
}

async function evaluateTrajectories(req) {
  const config = validateInput(req.body);
  const db = await getDatabase();
  const pair = await loadPair(db, req);
  const states = { baseline: JSON.parse(pair.baseline.state_json),
    candidate: JSON.parse(pair.candidate.state_json) };
  const probes = await runPairedProbes(states, config);
  return { success: true, operation: 'ontogenetic-evaluate',
    baselineObjectId: pair.baseline.id, candidateObjectId: pair.candidate.id,
    evaluationMode: 'trusted_probe_process', ...summarize(states, probes) };
}

module.exports = { evaluateTrajectories, validateInput, runPairedProbes, summarize };
