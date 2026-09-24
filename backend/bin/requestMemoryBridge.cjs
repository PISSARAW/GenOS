'use strict';

const profiler = require('../src/services/requestProfilerService');
const router = require('../src/services/executionRouterService');
const registry = require('../src/services/bestKnownResultService');

function requestDeps(request) {
  return {
    repo_head: request.repo_head || request.repoHead || '',
    workspace: request.workspace_root || request.workspaceRoot || '',
  };
}

async function checkReuse(db, request, task) {
  const minted = profiler.profileRequest({ mission: task, ...request });
  const route = router.chooseExecutionPath(minted.profile);
  const lookup = await registry.lookupReusable(db, {
    semanticId: minted.semanticId, dependencies: requestDeps(request),
  });
  return { minted, route, lookup };
}

function primitivePayload(minted, route, primitive) {
  return {
    orchestratorId: 'request-memory',
    success: true,
    verdict: 'completed',
    reused: false,
    requestClass: minted.profile.request_class,
    executionPath: route.mode,
    semanticId: minted.semanticId,
    result: primitive.value,
    receipt: primitive.receipt,
  };
}

function reusedPayload(minted, route, champion) {
  return {
    orchestratorId: 'request-memory',
    success: true,
    verdict: 'completed',
    reused: true,
    requestClass: minted.profile.request_class,
    executionPath: route.mode,
    semanticId: minted.semanticId,
    result: safeParse(champion.content_json),
    championId: champion.id,
    championVersion: champion.result_version,
  };
}

function safeParse(text) {
  try {
    return JSON.parse(text || '{}');
  } catch (_) {
    return { raw: String(text || '') };
  }
}

async function storePrimitive(db, bundle) {
  const minted = bundle.minted;
  const route = bundle.route;
  const primitive = bundle.primitive;
  const request = bundle.request;
  const expiry = registry.expiryFor(minted.profile);
  await registry.storeCandidate(db, {
    semanticId: minted.semanticId,
    normalizedIntent: minted.normalized.text,
    requestClass: minted.profile.request_class,
    profileJson: JSON.stringify(minted.profile),
    status: 'VERIFIED',
    contentJson: JSON.stringify({ value: primitive.value }),
    evidenceJson: JSON.stringify([{ nature: 'deterministic', receipt: primitive.receipt }]),
    uncertaintyJson: JSON.stringify({}),
    dependenciesJson: JSON.stringify(requestDeps(request)),
    executionJson: JSON.stringify({ mode: route.mode, trajectory: [route.mode] }),
    validityHorizonMs: expiry.horizonMs,
    expiresAt: expiry.expiresAt,
    utility: 1.0,
    costJson: JSON.stringify({ orchestration: 'none' }),
    supersedes: null,
  });
}

async function storeMissionResult(db, bundle) {  const expiry = registry.expiryFor(bundle.minted.profile);
  await registry.storeCandidate(db, {
    semanticId: bundle.minted.semanticId,
    normalizedIntent: bundle.minted.normalized.text,
    requestClass: bundle.minted.profile.request_class,
    profileJson: JSON.stringify(bundle.minted.profile),
    status: 'PROVISIONAL',
    contentJson: JSON.stringify(bundle.summary || {}),
    evidenceJson: JSON.stringify([]),
    uncertaintyJson: JSON.stringify({ epistemic_debt: true }),
    dependenciesJson: JSON.stringify(requestDeps(bundle.request)),
    executionJson: JSON.stringify({ mode: bundle.route.mode, trajectory: [bundle.route.mode] }),
    validityHorizonMs: expiry.horizonMs,
    expiresAt: expiry.expiresAt,
    utility: 0.5,
    costJson: JSON.stringify({ orchestration: bundle.route.mode }),
    supersedes: null,
  });
}

module.exports = {
  checkReuse,
  primitivePayload,
  reusedPayload,
  storePrimitive,
  storeMissionResult,
  maybeHandleMinimal,
};

async function maybeHandleMinimal(db, request, task) {
  const checked = await checkReuse(db, request, task);
  if (checked.lookup.hit) {
    return { handled: true, payload: reusedPayload(checked.minted, checked.route, checked.lookup.champion), minted: checked.minted, route: checked.route };
  }
  if (checked.route.mode !== 'primitive') return { handled: false, minted: checked.minted, route: checked.route };
  const primitive = router.tryArithmeticPrimitive(checked.minted.normalized.text);
  if (!primitive) return { handled: false, minted: checked.minted, route: checked.route };
  await storePrimitive(db, { minted: checked.minted, route: checked.route, primitive, request });
  return { handled: true, payload: primitivePayload(checked.minted, checked.route, primitive), minted: checked.minted, route: checked.route };
}
