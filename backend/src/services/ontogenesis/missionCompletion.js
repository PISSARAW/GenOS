'use strict';

const continuity = require('../missionContinuityService');
const { summarizeAgents } = require('../orchestratorOutcome');
const { buildMissionContext } = require('../../../bin/orchestratorMissionHelpersBuildContext.cjs');

const TERMINAL = ['completed', 'blocked', 'error', 'terminated', 'apoptosis', 'unverified', 'failed', 'quarantined'];

async function missionAgents(db, id) {
  return db.all(`WITH RECURSIVE family(id) AS (
    SELECT id FROM agents WHERE id = ? UNION SELECT a.id FROM agents a JOIN family f ON a.parent_agent_id = f.id
  ) SELECT a.* FROM agents a JOIN family f ON a.id = f.id`, [id]);
}

function settled(agents) {
  return agents.length > 0 && agents.every((agent) => !agent.runtime_pid && TERMINAL.includes(agent.status));
}

async function waitForMission(db, request, options) {
  const deadline = Date.now() + request.timeoutMs;
  while (Date.now() < deadline) {
    if (options.stopped()) throw new Error('execution-arretee');
    const agents = await missionAgents(db, request.id);
    if (settled(agents)) return agents;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('mission-delai-depasse');
}

async function completionGate(db, request, agents) {
  const outcome = summarizeAgents(agents);
  if (!agents.every((agent) => agent.status === 'completed')) return { allowed: false, reason: 'agents-non-verifies' };
  const context = await buildMissionContext({ db, missionId: request.id, agents, outcome, request, policyRequest: request });
  const evidenceGate = verifyEvidenceContract(request, context);
  if (evidenceGate) return evidenceGate;
  const mission = continuity.buildMissionInput(request.id, request.mission, {
    orchestratorAgentId: request.id, completionContract: context.completionContract,
    invariants: context.invariants, safetyConstraints: context.safetyConstraints, context: context.context
  });
  const evaluation = await continuity.evaluateContinuity(db, mission);
  return continuity.transitionMissionToComplete(db, { organism: evaluation.organism, mission, context: context.context });
}

function verifyEvidenceContract(request, context) {
  if (request.requiresEvidenceBeforePromotion === false) return null;
  const evidence = context.context && context.context.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return { allowed: false, reason: 'evidence-independante-requise' };
  }
  return null;
}

module.exports = { waitForMission, completionGate, missionAgents, settled, verifyEvidenceContract };
