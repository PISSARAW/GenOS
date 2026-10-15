const { defaultForaging } = require('../../foragingScoutHarvesterService');
const { forageStep } = require('../../foragingLoopService');
const { defaultBrowserScout } = require('../../browserScoutService');
const sourceAttestation = require('../../foragingSourceAttestation');

async function handleOptimalForaging(args) {
  const action = args.action || 'evaluate_patch';

  if (['forage_step', 'closed_loop', 'closed_loop_step'].includes(action)) {
    return optimalForagingForageStep({ args });
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

async function optimalForagingForageStep({ args }) {
  const sessionId = args.session_id || args.sessionId || null;
  let claims;
  try {
    claims = verifyForagingSource(args, sessionId);
  } catch (error) {
    return rejectedForagingSource(error);
  }
  const step = await forageStep({
    sessionId,
    patchHistory: args.patch_history || args.history,
    elapsedTimeSec: args.elapsed_time_sec,
    iteration: args.iteration,
    nextUrl: args.next_url || args.nextUrl,
    navigationScope: args.navigation_scope || args.navigationScope,
    htmlContent: args.html_content || args.html
  });
  if (!sourceAttestation.verifyObservation(claims, step.receipt)) {
    return rejectedForagingSource(new Error('Foraging observation does not match its signed source attestation.'));
  }
  const attested = sourceAttestation.bindReceipt(step, claims, args.source_attestation.signature);
  const actionStatus = step.action.status;
  const session = defaultBrowserScout.getSession(sessionId);
  const simulated = !session || !session.browserPage;
  const successful = !['not_executed', 'failed', 'refused'].includes(actionStatus);
  return {
    configured: true,
    success: successful,
    status: actionStatus === 'executed' ? 'completed'
      : actionStatus === 'failed' ? 'action_failed'
        : actionStatus === 'refused' ? 'out_of_scope'
        : actionStatus === 'not_executed' ? 'decision_only' : 'observed',
    transport: 'local_service',
    simulated,
    output: JSON.stringify({ ...attested, simulated }, null, 2)
  };
}

function verifyForagingSource(args, sessionId) {
  const session = defaultBrowserScout.getSession(sessionId);
  const scope = sourceAttestation.normalizeScope(args.navigation_scope || args.navigationScope);
  const proposedUrl = args.next_url || args.nextUrl || (session && session.currentUrl);
  if (!proposedUrl) throw new Error('Foraging source target is missing.');
  const expectedUrl = expectedObservedUrl(proposedUrl, scope, session);
  return sourceAttestation.verifyBeforeNavigation({
    attestation: args.source_attestation,
    missionId: args.mission_id || args.missionId,
    targetUrl: expectedUrl,
    scope,
    htmlContent: args.html_content || args.html
  });
}

function expectedObservedUrl(proposedUrl, scope, session) {
  if (!session || !session.currentUrl) return proposedUrl;
  return scope.includes(new URL(proposedUrl).origin) ? proposedUrl : session.currentUrl;
}

function rejectedForagingSource(error) {
  return {
    configured: true,
    success: false,
    status: 'source_unverified',
    transport: 'local_service',
    output: error.message || String(error)
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
