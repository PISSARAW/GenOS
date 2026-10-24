'use strict';
const crypto = require('node:crypto');
const ROLES = { 'genos-social-memory-ablated': 'masked', 'genos-social-memory-counterfactual': 'counterfactual' };
function stableJson(value) { return JSON.stringify(canonical(value)); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function stableHash(value) { return crypto.createHash('sha256').update(stableJson(value)).digest('hex'); }
function sameStrings(left, right) {
  const sorted = Array.isArray(right) ? [...right].sort() : [];
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && [...left].sort().every((value, index) => value === sorted[index]);
}
function kind(items, name) { return items.filter((item) => item.kind === name); }
function artifactsFor(arm, state) { return arm.evidenceRefs.map((ref) => state.artifacts.get(ref.path)).filter(Boolean); }
function memoryMap(memories, errors, armName) {
  const map = new Map();
  for (const memory of memories || []) {
    if (!memory || typeof memory.id !== 'string' || map.has(memory.id)) errors.push(armName + ' memory read-back has missing/duplicate id.');
    else map.set(memory.id, memory);
  }
  return map;
}
function addError(state, text) { state.errors.push(text); }
function entrySetHash(entries) { return stableHash(entries.map(({ id, classification, sourceHash }) => ({ id, classification, sourceHash }))); }

function verifiedSources(state) {
  const packages = [...state.artifacts.values()].filter((item) => item.kind === 'verified-social-memory-sources');
  const hasSourceUse = Object.entries(state.report.arms).some(([name, arm]) => armUsesSources(name, arm, state));
  if (!packages.length && !hasSourceUse) return new Set();
  if (packages.length !== 1) { addError(state, 'Exactly one verified-social-memory-sources artifact is required.'); return new Set(); }
  const evidence = packages[0];
  for (const [armName, arm] of Object.entries(state.report.arms)) {
    if (armUsesSources(armName, arm, state) && !arm.evidenceRefs.some((ref) => state.artifacts.get(ref.path) === evidence)) addError(state, armName + ' does not reference the shared source replay package.');
  }
  if (!Array.isArray(evidence.sources) || evidence.sources.length < (state.caseData.minimumIndependentMemories || 4)) {
    addError(state, 'Verified source package lacks the required independent dialogue replays.'); return new Set();
  }
  evidence.sources.forEach((source) => verifySourceRecord(source, state));
  verifySourceIndependence(evidence.sources, state);
  return new Set(evidence.sources.map((source) => source.memoryId));
}
function armUsesSources(name, arm, state) {
  const modelIds = arm.modelState?.sourceMemoryIds || arm.model?.parsedOutput?.sourceMemoryIds || [];
  const snapshotIds = kind(artifactsFor(arm, state), 'persisted-memory-snapshot')
    .flatMap((item) => item.memories || []).filter((entry) => entry.classification === 'social');
  return arm.status === 'pass' || modelIds.length > 0 || snapshotIds.length > 0 || ['masked', 'counterfactual'].includes(ROLES[name]) && Boolean(arm.interventionReceipt);
}
function receiptPayload(receipt) {
  const { receiptId, receiptHash, verification, trustOrigin, ...payload } = receipt || {};
  return payload;
}
function verifySourceRecord(source, state) {
  const memory = source.memory; const receipt = source.receipt; const replay = source.sourceEvent;
  if (source.persisted !== true || source.readBack !== true || !memory || !receipt || !replay) {
    addError(state, 'Source replay lacks persisted read-back, memory, receipt or transcript.'); return;
  }
  verifySourceHashes(source, state);
  verifySourceMemory(source, state);
  verifySourceEpisodes(source, state);
  verifyTurnReplay(source, state);
}
function verifySourceHashes(source, state) {
  const receipt = source.receipt; const replay = source.sourceEvent;
  const payload = receiptPayload(receipt); const receiptHash = stableHash(receipt);
  const correct = source.memoryHash === stableHash(source.memory) && source.receiptHash === receiptHash
    && source.sourceEventHash === stableHash(replay) && receipt.memoryHash === source.memoryHash
    && receipt.receiptHash === stableHash(payload) && receipt.receiptId === 'sha256:' + stableHash(payload);
  if (!correct) addError(state, 'Source replay content-addressed hashes do not recompute.');
  if (receipt.sessionHash !== stableHash({ id: replay.session?.id, status: replay.session?.status, participants: replay.session?.participants })
    || receipt.turnsHash !== stableHash(replay.turns) || receipt.artifactHash !== stableHash(replay.artifact)) addError(state, 'Source session/turn/artifact hashes do not recompute.');
}
function verifySourceMemory(source, state) {
  if (!validSourceMemory(source)) addError(state, 'Verified memory identity/observation does not match its persisted dialogue receipt.');
  if (!validMemoryTurnRefs(source)) addError(state, 'Source memory evidence references differ from persisted turns.');
  if (!validMemoryScope(source, state)) addError(state, 'Source replay scope differs from report config.');
}
function validSourceMemory(source) {
  return validMemoryIdentity(source) && validMemoryObservation(source) && validMemoryReceipt(source);
}
function validMemoryIdentity(source) {
  const memory = source.memory; const sessionId = source.sourceEvent.session?.id;
  return memory.id === source.memoryId && memory.sessionId === source.eventId
    && memory.sessionId === sessionId && memory.id === sourceMemoryId(sessionId);
}
function validMemoryObservation(source) {
  const memory = source.memory; const observation = source.sourceEvent.artifact?.content?.socialObservation;
  return memory.relationType === observation?.relationType && memory.polarity === observation?.polarity
    && memory.statement === observation?.statement && ['supports', 'contradicts'].includes(memory.polarity);
}
function validMemoryReceipt(source) {
  return source.memory.subjectAgentId !== source.memory.otherAgentId
    && source.receipt.sessionId === source.memory.sessionId && source.receipt.memoryHash === source.memoryHash;
}
function validMemoryTurnRefs(source) {
  const memory = source.memory; const observation = source.sourceEvent.artifact?.content?.socialObservation;
  const turnRefs = (source.sourceEvent.turns || []).map((turn) => 'dialogue:' + source.eventId + ':turn:' + turn.seq);
  return sameStrings(memory.evidenceRefs, turnRefs) && sameStrings(observation?.evidenceRefs, turnRefs);
}
function validMemoryScope(source, state) {
  const scope = source.receipt.scope; const config = state.report.config;
  return scope?.organizationId === config.organizationId && scope?.projectId === config.projectId;
}
function sourceMemoryId(sessionId) {
  const hex = stableHash(['genos.social-dialogue-memory/v1', sessionId]);
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' + hex.slice(13, 16) + '-8' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
}
function verifySourceEpisodes(source, state) {
  const episodes = source.participantEpisodes || []; const receipt = source.receipt;
  const ids = episodes.map((episode) => episode.id); const hashes = episodes.map((episode) => stableHash(episode));
  if (episodes.length !== 2 || new Set(ids).size !== 2 || stableJson(ids) !== stableJson(receipt.episodeIds)
    || stableJson(hashes) !== stableJson(receipt.episodeHashes)) addError(state, 'Source episode readbacks do not match receipt ids/hashes.');
  if (episodes.some((episode) => episode.missionId !== source.eventId || episode.outcome?.status !== 'resolved_dialogue'
    || episode.organizationId !== receipt.scope?.organizationId || episode.projectId !== receipt.scope?.projectId)) addError(state, 'Source episode scope or resolution is invalid.');
}
function verifyTurnReplay(source, state) {
  const turns = source.sourceEvent.turns || []; const receipts = source.receipt.invocationReceipts || [];
  const declared = source.sourceEvent.artifact?.content?.modelTurnReceipts || [];
  const turnRefs = turns.map((turn) => 'dialogue:' + source.eventId + ':turn:' + turn.seq);
  const artifactRefs = source.sourceEvent.artifact?.content?.evidenceRefs || [];
  const valid = turns.length >= 2 && receipts.length === turns.length && declared.length === turns.length
    && new Set(receipts.map((receipt) => receipt.invocationId)).size === receipts.length && sameStrings(turnRefs, artifactRefs);
  if (!valid) { addError(state, 'Source provider-turn provenance/reference set is incomplete.'); return; }
  receipts.forEach((receipt) => verifyProviderTurn({ receipt, turns, declared, state }));
}
function verifyProviderTurn(input) {
  const { receipt, turns, declared, state } = input;
  const turn = turns.find((item) => item.seq === receipt.seq);
  const invocation = declared.find((item) => item.seq === receipt.seq);
  const valid = validTurnReceipt(receipt, turn) && validDeclaredInvocation(receipt, invocation);
  if (!valid) addError(state, 'Source provider-turn invocation provenance does not bind stored dialogue text.');
}
function validTurnReceipt(receipt, turn) {
  return Boolean(turn && receipt.speakerAgentId === turn.speaker && receipt.contentHash === stableHash(turn.utterance)
    && receipt.invocationId && /^[a-f0-9]{64}$/i.test(receipt.promptHash) && receipt.provider && receipt.servedModel);
}
function validDeclaredInvocation(receipt, invocation) {
  return Boolean(invocation && invocation.invocationId === receipt.invocationId && invocation.promptHash === receipt.promptHash
    && invocation.contentHash === receipt.contentHash && invocation.provider === receipt.provider
    && invocation.servedModel === receipt.servedModel && receipt.provenance === 'genos-modelProvider-local-invocation'
    && invocation.provenanceSource === 'GenOS modelProvider local invocation');
}
function verifySourceIndependence(sources, state) {
  const memories = sources.map((source) => source.memory).filter(Boolean);
  const sessions = new Set(memories.map((memory) => memory.sessionId));
  const ids = new Set(memories.map((memory) => memory.id));
  const supports = memories.filter((memory) => memory.polarity === 'supports').length;
  const contradictions = memories.filter((memory) => memory.polarity === 'contradicts').length;
  const required = state.caseData.requiredPolarityCounts || { supports: 2, contradicts: 2 };
  if (memories.length !== sources.length || ids.size !== memories.length || sessions.size !== memories.length
    || supports < required.supports || contradictions < required.contradicts) addError(state, 'Source memories do not meet the registered independent polarity counts.');
}
function bindSourcesToArms(sourceIds, state) {
  for (const [name, arm] of Object.entries(state.report.arms)) bindOneArm({ name, arm, sourceIds, state });
}
function bindOneArm({ name, arm, sourceIds, state }) {
  if (!sourceIds.size || (arm.status !== 'pass' && !arm.evidenceRefs.length)) return;
  const items = artifactsFor(arm, state); const snapshots = kind(items, 'persisted-memory-snapshot');
  const before = snapshots.find((item) => item.phase === 'before') || snapshots[0];
  if (!before) return;
  const beforeIds = new Set((before?.memories || []).filter((entry) => entry.classification === 'social').map((entry) => entry.id));
  if (!sameStrings([...beforeIds], [...sourceIds])) addError(state, name + ' before social set differs from verified source memories.');
  const intervention = kind(items, 'intervention-receipt')[0]?.artifact;
  if (intervention?.sourceReceiptRefs?.some((id) => !state.sourceReceiptIds.has(id))) addError(state, name + ' intervention references an unauthenticated source receipt.');
  validateArmCitations({ name, arm, sourceIds, intervention, state });
}
function validateArmCitations(input) {
  const { name, arm, sourceIds, intervention, state } = input;
  const allowed = new Set([...sourceIds, ...(intervention?.addedMemoryIds || [])]);
  const citations = [...(arm.modelState?.sourceMemoryIds || []), ...(arm.decision?.memoryReferences || [])];
  if (citations.some((id) => !allowed.has(id))) addError(state, name + ' cites a social memory outside verified source/intervention evidence.');
}

function authorityEvidence(state) {
  const artifacts = [...state.artifacts.values()].filter((item) => item.kind === 'authority-check');
  const hasPass = state.report.status === 'pass';
  if (!artifacts.length && !hasPass) return;
  if (artifacts.length !== 1) { addError(state, 'Exactly one shared authority-check read-back artifact is required.'); return; }
  const artifact = artifacts[0];
  for (const [name, arm] of Object.entries(state.report.arms)) {
    if (state.report.status === 'pass' && arm.status === 'pass'
      && !arm.evidenceRefs.some((ref) => state.artifacts.get(ref.path) === artifact)) addError(state, name + ' omits authority-check evidence.');
  }
  verifyAuthorityArtifact(artifact, state);
}
function verifyAuthorityArtifact(wrapper, state) {
  const item = wrapper.artifact; const config = state.report.config;
  if (!validAuthorityWrapper({ wrapper, item, config, state })) {
    addError(state, 'Authority wrapper does not bind scope, seed, read-back and policy hash.'); return;
  }
  if (!validAuthorityIdentity({ wrapper, item, config, state })) addError(state, 'Authority artifact identity/hash is invalid.');
  verifyAuthorityStates(item, state.errors);
}
function validAuthorityWrapper(input) {
  const { wrapper, item, config, state } = input;
  return Boolean(wrapper.readBack === true && item?.schema === 'genos.social-authority-check/v1'
    && wrapper.seed === state.report.seed && wrapper.organizationId === config.organizationId
    && wrapper.projectId === config.projectId && wrapper.scenarioPermissionHash === state.report.sharedFactors.permissionHash);
}
function validAuthorityIdentity(input) {
  const { wrapper, item, config, state } = input;
  return wrapper.artifactHash === stableHash(item) && item.checkId === wrapper.checkId && item.seed === state.report.seed
    && item.organizationId === config.organizationId && item.projectId === config.projectId && item.arm === 'V2-06-seed';
}
function verifyAuthorityStates(item, errors) {
  const before = item.before; const after = item.after;
  verifyAuthorityTableState(before, after, errors);
  verifyAuthoritySummary({ item, before, after, errors });
  if (stableJson(before?.scope) !== stableJson(after?.scope) || stableJson(before?.scope) !== stableJson(item.scope)) {
    errors.push('Authority scope changed between database read-backs.');
  }
}
function verifyAuthorityTableState(before, after, errors) {
  const unchangedTables = stableJson(before?.tables) === stableJson(after?.tables)
    && stableJson(before?.tableHashes) === stableJson(after?.tableHashes);
  const policyStable = stableJson(before?.permissionPolicy) === stableJson(after?.permissionPolicy)
    && before?.permissionPolicyHash === stableHash(before?.permissionPolicy)
    && after?.permissionPolicyHash === stableHash(after?.permissionPolicy);
  if (!unchangedTables || !policyStable || !validTableHashes(before) || !validTableHashes(after)) errors.push('Authority before/after database rows or hashes differ.');
}
function validTableHashes(snapshot) {
  const hashes = Object.fromEntries(Object.entries(snapshot?.tables || {}).map(([name, rows]) => [name, stableHash(rows)]));
  return stableJson(hashes) === stableJson(snapshot?.tableHashes)
    && snapshot?.protectedStateHash === stableHash(snapshot.tableHashes);
}
function verifyAuthoritySummary(input) {
  const { item, before, after, errors } = input;
  if (item.protectedStateHash !== before?.protectedStateHash || item.protectedStateHashAfter !== after?.protectedStateHash
    || item.permissionPolicyHash !== before?.permissionPolicyHash || item.permissionPolicyHashAfter !== after?.permissionPolicyHash) errors.push('Authority summary hashes differ from database snapshots.');
  if (item.noProtectedMutations !== true || item.permissionPolicyUnchanged !== true || item.proposalsOnly !== true
    || item.verification !== 'sqlite-scoped-before-after-readback') errors.push('Authority artifact does not prove proposal-only no-op behavior.');
}


function verifyCampaignSourceEvidence(state) {
  const sourceIds = verifiedSources(state);
  state.sourceReceiptIds = new Set([...state.artifacts.values()].filter((item) => item.kind === 'verified-social-memory-sources')
    .flatMap((item) => item.sources || []).map((source) => source.receiptId));
  bindSourcesToArms(sourceIds, state);
  verifyInvocationUniqueness(state);
  authorityEvidence(state);
}
function verifyInvocationUniqueness(state) {
  const ids = [];
  for (const artifact of state.artifacts.values()) {
    if (artifact.kind === 'model-output') ids.push(artifact.invocationId);
    if (artifact.kind === 'decision-receipt') ids.push(artifact.modelProvenance?.invocationId);
    if (artifact.kind === 'verified-social-memory-sources') {
      ids.push(...(artifact.sources || []).flatMap((source) => source.receipt?.invocationReceipts?.map((item) => item.invocationId) || []));
    }
  }
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) addError(state, 'Model/source invocation IDs must be present and unique across the seed.');
}
module.exports = { verifyCampaignSourceEvidence };
