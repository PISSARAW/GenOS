'use strict';

const path = require('node:path');
const fs = require('node:fs');

function confinedPath(root, value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const base = path.resolve(root);
  const target = path.resolve(base, value);
  const relative = path.relative(base, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return null;
  return realPathConfined(base, target) ? target : null;
}

function realPathConfined(root, target) {
  if (!fs.existsSync(root)) return true;
  let existing = target;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(existing));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sourceBranch(payload) { return payload.branchId || payload.executionRunId || undefined; }

function proposalExperience(context) {
  const { event, payload, workspaceRoot } = context;
  const proposal = payload.proposal;
  const tests = Array.isArray(proposal.tests) ? proposal.tests : [];
  const changedFiles = Array.isArray(proposal.changedFiles) ? proposal.changedFiles : [];
  return {
    root: workspaceRoot, strategy: 'local_capsule_patch',
    context: event.detail || 'Local isolated code worker',
    outcome: `Changed ${changedFiles.join(', ') || 'no files'}; ${tests.map((test) => `${test.command}:${test.exitCode}`).join(', ') || 'no tests requested'}`,
    successful: tests.length > 0 && tests.every((test) => test.exitCode === 0),
    evidence: [proposal.proposal?.evidence, ...changedFiles].filter(Boolean),
    source_branch: sourceBranch(payload)
  };
}

function experienceArguments(context) {
  const { payload, event, workspaceRoot } = context;
  if (payload.strategy && payload.outcome) return {
    root: workspaceRoot, strategy: payload.strategy, context: payload.context || event.detail || 'Autonomous worker event',
    outcome: payload.outcome, successful: event.eventType === 'AGENT_COMPLETED',
    evidence: payload.evidence || [event.id].filter(Boolean), source_branch: sourceBranch(payload)
  };
  return payload.proposal ? proposalExperience(context) : null;
}

function snapshotArguments(context) {
  if (context.decision.action !== 'quarantine_and_fork') return null;
  const agent = confinedPath(context.workspaceRoot, context.payload.agent || 'agent.json');
  const out = confinedPath(context.workspaceRoot, context.payload.out || `snapshot_quarantine_${Date.now()}.json`);
  if (!agent || !out || agent === out) return null;
  return { agent, out };
}

function parasiticArguments(context) {
  const manifest = confinedPath(context.workspaceRoot, context.payload.manifest);
  return manifest ? { manifest: manifest.split(path.sep).join('/') } : null;
}

function trajectoryArguments(context) {
  const payload = context.payload;
  if (!payload.solveId || !Array.isArray(payload.scores) || !payload.scores.length) return null;
  return { root: context.workspaceRoot, solve_id: payload.solveId, scores: payload.scores };
}

function actionArguments(decision, event, workspaceRoot) {
  if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) return null;
  const context = { decision, event, payload: event.payload || {}, workspaceRoot };
  const handlers = {
    genos_record_experience: experienceArguments, genos_snapshot: snapshotArguments,
    genos_parasitic_pressure: parasiticArguments, genos_evaluate_trajectories: trajectoryArguments,
    genos_execute_primitive: require('./orchestrationRankArguments').rankingArguments
  };
  if (decision.tool === 'genos_replay') return context.payload.snapshot ? { root: workspaceRoot, snapshot: context.payload.snapshot } : null;
  const result = handlers[decision.tool]?.(context) || null;
  return decision.tool === 'genos_record_experience' && result ? canonicalExperience(result, event) : result;
}

function canonicalExperience(experience, event) {
  const { root, ...fields } = experience;
  return { ...fields, agentId: event.agentId, actionInput: experience.strategy,
    observationOutput: experience.outcome, rewardScore: experience.successful ? 1 : 0,
    contextState: { context: experience.context, workspaceRoot: experience.root, evidence: experience.evidence, sourceBranch: experience.source_branch } };
}

module.exports = { actionArguments, confinedPath };
