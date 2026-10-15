const { defaultForaging } = require('../../foragingScoutHarvesterService');
const { forageStep } = require('../../foragingLoopService');
const { defaultBrowserScout } = require('../../browserScoutService');
const sourceAttestation = require('../../foragingSourceAttestation');
const missionAuthority = require('../../foragingMissionAuthority');

async function handleOptimalForaging(args, _run, caller = {}) {
  const action = args.action || 'evaluate_patch';

  if (['forage_step', 'closed_loop', 'closed_loop_step'].includes(action)) {
    return optimalForagingForageStep({ args, caller });
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

async function optimalForagingForageStep({ args, caller }) {
  const sessionId = args.session_id || args.sessionId || null;
  let claims;
  try {
    claims = await verifyForagingSource(args, sessionId, caller);
  } catch (error) {
    return rejectedForagingSource(error);
  }
  const step = await executeForageStep(args, sessionId);
  return verifiedForagingResponse({ args, sessionId, claims, step });
}

async function executeForageStep(args, sessionId) {
  return forageStep({
    sessionId,
    patchHistory: args.patch_history || args.history,
    elapsedTimeSec: args.elapsed_time_sec,
    iteration: args.iteration,
    nextUrl: args.next_url || args.nextUrl,
    navigationScope: args.navigation_scope || args.navigationScope,
    htmlContent: args.html_content || args.html
  });
}

function verifiedForagingResponse({ args, sessionId, claims, step }) {
  if (!sourceAttestation.verifyObservation(claims, step.receipt)) {
    return rejectedForagingSource(new Error('Foraging observation does not match its signed source attestation.'));
  }
  const attested = sourceAttestation.bindReceipt(step, claims, args.source_attestation.signature);
  const actionStatus = step.action.status;
  const session = defaultBrowserScout.getSession(sessionId);
  const simulated = !session || !session.browserPage;
  return {
    configured: true,
    success: actionStatus !== 'not_executed' && actionStatus !== 'failed' && actionStatus !== 'refused',
    status: foragingActionStatus(actionStatus),
    transport: 'local_service',
    simulated,
    output: JSON.stringify({ ...attested, simulated }, null, 2)
  };
}

function foragingActionStatus(status) {
  const statuses = { executed: 'completed', failed: 'action_failed', refused: 'out_of_scope',
    not_executed: 'decision_only' };
  return statuses[status] || 'observed';
}

async function verifyForagingSource(args, sessionId, caller) {
  const missionId = args.mission_id || args.missionId;
  const db = await require('../../../db').getDatabase();
  await missionAuthority.assertActiveMissionMember({ db, caller, missionId });
  const session = defaultBrowserScout.getSession(sessionId);
  const scope = sourceAttestation.normalizeScope(args.navigation_scope || args.navigationScope);
  const proposedUrl = args.next_url || args.nextUrl || (session && session.currentUrl);
  if (!proposedUrl) throw new Error('Foraging source target is missing.');
  const expectedUrl = expectedObservedUrl(proposedUrl, scope, session);
  return sourceAttestation.verifyBeforeNavigation({
    attestation: args.source_attestation,
    missionId,
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
