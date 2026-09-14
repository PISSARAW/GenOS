/**
 * Lot 2 : Primitives de Mémoire (compile, cherry-pick, search, failures, stdp)
 */
const vectorMemory = require('../vectorMemoryService');
const trajectoryService = require('../trajectoryService');
const episodicMemory = require('../episodicMemoryService');
const telemetry = require('../telemetryObserver');
const epistemics = require('../epistemics');
const { getDatabase, withTransaction } = require('../../db');
const crypto = require('crypto');
const { stdpUpdate, firstTruthy, firstNonNull } = require('./memoryStdp');

function resolveRewardScore(context) {
  if (typeof context.rewardScore === 'number') return context.rewardScore;
  if (typeof context.reward_score === 'number') return context.reward_score;
  if (typeof context.successful === 'boolean') return context.successful ? 1.0 : 0.0;
  return 0.5;
}

async function recordExperience(context = {}) {
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, context.orchestrator_id, 'strategy_adapter');
  const sessionId = firstTruthy(context.sessionId, context.session_id, context.source_branch, context.branchId, null);
  const taskId = firstTruthy(context.taskId, context.task_id, context.task, context.strategy, null);
  const turnNumber = firstNonNull(context.turnNumber, context.turn_number, 0);
  const actionType = firstTruthy(context.actionType, context.action_type, context.strategy, 'experience');
  const actionInput = firstTruthy(context.actionInput, context.action_input, context.action, context.input, context.context, '');
  const observationOutput = firstTruthy(context.observationOutput, context.observation_output, context.observation, context.output, context.outcome, '');
  const rewardScore = resolveRewardScore(context);
  const contextState = firstTruthy(context.contextState, context.context_state, context.context, { evidence: firstTruthy(context.evidence, []) });

  const episode = await episodicMemory.recordEpisode({
    agentId,
    sessionId,
    taskId,
    turnNumber,
    actionType,
    contextState,
    actionInput,
    observationOutput,
    rewardScore
  });

  telemetry.emitEvent({
    eventType: 'EXPERIENCE_RECORDED',
    agentId,
    action: 'RECORD_EXPERIENCE',
    detail: `Recorded episodic experience ${episode.id} (${actionType}, reward ${rewardScore})`,
    severity: 'info',
    payload: { episodeId: episode.id, taskId, rewardScore, successful: rewardScore >= 0.7 }
  });

  return {
    success: true,
    episodeId: episode.id,
    episode
  };
}

async function compileMemory(context) {
  const db = await getDatabase();
  const facts = context.facts || [];
  const decisions = context.decisions || [];
  const failures = context.failures || [];
  const sourceRefs = context.source_refs || [];
  const agentId = context.agentId || context.orchestratorId || 'strategy_adapter';
  const items = [
    ...facts.map(f => ({ content: f, category: 'Fact' })),
    ...decisions.map(d => ({ content: d, category: 'Decision' })),
    ...failures.map(f => ({ content: '[FAILURE] ' + f, category: 'Failure' }))
  ];
  const ids = [];
  for (const item of items) {
    const id = await vectorMemory.storeMemory(agentId, item.content, null, {
      category: item.category,
      title: `${item.category}: ${(item.content || '').slice(0, 60)}`,
      synapticWeight: item.category === 'Failure' ? 1.5 : 1.0,
      organizationId: context.organizationId,
      projectId: context.projectId
    });
    ids.push(id);
  }
  telemetry.emitEvent({
    eventType: 'MEMORY_COMPILED',
    agentId: agentId,
    action: 'COMPILE',
    detail: 'Compiled ' + ids.length + ' memory entries from mission evidence.',
    severity: 'info',
    payload: { count: ids.length, sourceRefs }
  });
  return { success: true, compiledCount: ids.length, memoryIds: ids };
}

function buildFallbackTurns(context) {
  return [
    { step: 1, action: 'task_definition', classification: 'Exploration', detail: String(firstTruthy(context.task, '')).slice(0, 200) },
    { step: 2, action: 'task_completion', classification: 'Breakthrough', success: true, verified: true, detail: String(firstTruthy(context.reply, '')).slice(0, 200) }
  ];
}

function resolveGoldenPathTurns(context) {
  const turns = firstTruthy(context.turns, context.trajectory, []);
  if (Array.isArray(turns) && turns.length > 0) {
    return { turns };
  }
  if (firstTruthy(context.task, context.reply)) {
    if (firstTruthy(context.verified, context.verifiedEvidence)) {
      return { turns: buildFallbackTurns(context) };
    }
    return { error: 'Cannot record a reply as a Golden Path without verified evidence or explicit verification.' };
  }
  return { error: 'At least one trajectory turn is required for a golden path.' };
}

async function resolveWorkspaceId(tx, context) {
  const workspaceId = String(firstTruthy(context.workspaceId, '')).trim();
  if (workspaceId) {
    return workspaceId;
  }
  const defaultWs = await tx.get('SELECT id FROM workspaces ORDER BY rowid ASC LIMIT 1');
  return defaultWs ? defaultWs.id : 'ws-genos-core';
}

async function persistGoldenPath(tx, context, payload) {
  const { result, decisionId, buffer, turns } = payload;
  await tx.run(
    'INSERT OR IGNORE INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, embedding_blob, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    decisionId,
    firstTruthy(context.label, 'Golden Path'),
    JSON.stringify(result.goldenPathSteps),
    JSON.stringify(result.goldenPathSteps.map(s => firstTruthy(s.id, s.step, s.action))),
    firstTruthy(context.agentId, 'strategy_adapter'),
    'GoldenPath',
    buffer,
    firstTruthy(context.organizationId, null),
    firstTruthy(context.projectId, null)
  );
  if (result.deadEndSteps && result.deadEndSteps.length > 0) {
    await persistDeadEndDecisions(tx, result.deadEndSteps, {
      agentId: context.agentId,
      organizationId: context.organizationId,
      projectId: context.projectId
    });
  }
  const workspaceId = await resolveWorkspaceId(tx, context);
  return trajectoryService.recordMissionTrajectory(tx, {
    id: context.trajectoryId,
    agentId: context.agentId,
    workspaceId,
    task: context.task,
    report: context.report,
    turns,
    status: context.status
  });
}

async function cherryPickGoldenPath(context) {
  const resolved = resolveGoldenPathTurns(context);
  if (resolved.error) {
    return { success: false, error: resolved.error };
  }
  const turns = resolved.turns;
  const result = vectorMemory.cherryPickGoldenPath(turns);
  const db = await getDatabase();
  const decisionId = 'dec-gp-' + crypto.createHash('sha256').update(JSON.stringify({ agentId: firstTruthy(context.agentId, 'strategy_adapter'), label: firstTruthy(context.label, 'Golden Path'), turns })).digest('hex').slice(0, 32);
  const { embed } = require('../embeddingProvider');
  const { textToVector } = require('../memoryScoring');
  const summaryText = `${firstTruthy(context.label, 'Golden Path')} ${result.goldenPathSteps.map(s => firstTruthy(s.id, s.step, s.action, '')).join(' ')}`.trim();
  const vec = firstTruthy(await embed(summaryText), textToVector(summaryText));
  const float32 = new Float32Array(vec);
  const buffer = Buffer.from(float32.buffer);
  let trajRecord = null;
  await withTransaction(db, async (tx) => {
    trajRecord = await persistGoldenPath(tx, context, { result, decisionId, buffer, turns });
  });

  telemetry.emitEvent({
    eventType: 'GOLDEN_PATH_SYNTHESIZED',
    agentId: firstTruthy(context.agentId, 'strategy_adapter'),
    action: 'CHERRY_PICK',
    detail: 'Synthesized golden path: ' + result.prunedStepCount + ' steps, ' + result.noiseReductionPercent + '% noise reduction.',
    severity: 'info',
    payload: { ...result, decisionId, trajectoryId: firstNonNull(trajRecord, {}).trajectoryId }
  });
  return { success: true, decisionId, trajectoryId: firstNonNull(trajRecord, {}).trajectoryId, ...result };
}

async function searchMemory(context) {
  const db = await getDatabase();
  const query = context.query || context.task || '';
  const limit = context.limit || 5;
  const results = await vectorMemory.searchMemory(query, {
    limit,
    organizationId: context.organizationId,
    projectId: context.projectId,
    ownerId: context.agentId
  }, db);
  const experiences = results.allScoredExperiences || [];
  const validatedExperiences = experiences.map((item) => {
    const epistemic = epistemics.validateMemoryPerception(item);
    return {
      ...item,
      epistemicState: epistemic.state,
      isEpistemicallyValid: !epistemic.isInvalid()
    };
  });
  results.allScoredExperiences = validatedExperiences;
  const found = validatedExperiences.length;
  return { success: found > 0, resultCount: found, results };
}

const {
  searchFailures,
  avoidKnownDeadEnds,
  persistDeadEndDecisions
} = require('./memoryDeadEnds');


module.exports = { recordExperience, compileMemory, cherryPickGoldenPath, searchMemory, searchFailures, avoidKnownDeadEnds, stdpUpdate };
