const { defaultForaging } = require('../../foragingScoutHarvesterService');
const { forageStep } = require('../../foragingLoopService');

async function handleOptimalForaging(args) {
  const action = args.action || 'evaluate_patch';

  if (['forage_step', 'closed_loop', 'closed_loop_step'].includes(action)) {
    return optimalForagingForageStep({ args, action });
  }

  if (['evaluate_patch', 'evaluate'].includes(action)) {
    return optimalForagingEvaluatePatch({ args });
  }

  if (['levy_step', 'step'].includes(action)) {
    return optimalForagingLevyStep({ args });
  }

  if (['deposit', 'stigmergy_deposit'].includes(action)) {
    return optimalForagingDeposit({ args });
  }

  if (['harvest', 'stigmergy_harvest'].includes(action)) {
    return optimalForagingHarvest({ args });
  }

  return {
    configured: true,
    success: false,
    status: 'invalid_action',
    transport: 'local_service',
    output: `Unknown optimal foraging action: ${action}`
  };
}

function handleOptimalForagingError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'local_service',
    output: e.message || String(e)
  };
}

module.exports = {
  handleOptimalForaging,
  handleOptimalForagingError
};

async function optimalForagingForageStep({ args, action }) {
  const sessionId = args.session_id || args.sessionId || null;
  const step = await forageStep({
    sessionId,
    patchHistory: args.patch_history || args.history,
    elapsedTimeSec: args.elapsed_time_sec,
    iteration: args.iteration,
    nextUrl: args.next_url || args.nextUrl,
    htmlContent: args.html_content || args.html
  });
  const actionStatus = step.action.status;
  const simulated = !sessionId;
  return {
    configured: true,
    success: actionStatus !== 'not_executed' && actionStatus !== 'failed',
    status: actionStatus === 'executed' ? 'completed'
      : actionStatus === 'failed' ? 'action_failed'
        : actionStatus === 'not_executed' ? 'decision_only' : 'observed',
    transport: 'local_service',
    simulated,
    output: JSON.stringify({ ...step, simulated }, null, 2)
  };
}

async function optimalForagingEvaluatePatch({ args }) {
  const history = Array.isArray(args.history) ? args.history : [{ infoGain: Number(args.info_gain || 0.5) }];
  const res = defaultForaging.evaluatePatchYield(history, Number(args.elapsed_time_sec || 2));
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local_service',
    output: JSON.stringify(res, null, 2)
  };
}

async function optimalForagingLevyStep({ args }) {
  const step = defaultForaging.computeLevyFlightStep(Number(args.iteration || 1));
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local_service',
    output: JSON.stringify(step, null, 2)
  };
}

async function optimalForagingDeposit({ args }) {
  const scoutId = args.scout_id || args.scoutId || 'scout-01';
  const url = args.url || 'https://web.internal/target';
  const artifact = {
    type: args.artifact_type || 'web_extracted_data',
    localPath: args.local_path || args.localPath,
    sha256: args.sha256,
    keyFacts: args.key_facts || args.keyFacts || {},
    confidence: args.confidence || 0.95
  };
  const token = defaultForaging.depositPheromoneEvidence(scoutId, url, artifact);
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local_service',
    output: JSON.stringify(token, null, 2)
  };
}

async function optimalForagingHarvest({ args }) {
  const tokenId = args.token_id || args.tokenId;
  const harvesterId = args.harvester_id || args.harvesterId || 'harvester-01';
  const harvestRes = defaultForaging.harvestEvidence(tokenId, harvesterId);
  return {
    configured: true,
    success: harvestRes.success,
    status: harvestRes.success ? 'completed' : 'tool_error',
    transport: 'local_service',
    output: JSON.stringify(harvestRes, null, 2)
  };
}
