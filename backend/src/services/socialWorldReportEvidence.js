'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateSocialMentalModel } = require('./socialMentalModelService');
const { verifyCampaignSourceEvidence } = require('./socialWorldSourceEvidence');

const ROLES = Object.freeze({
  'genos-full': 'baseline', 'genos-social-memory-ablated': 'masked',
  'genos-social-memory-counterfactual': 'counterfactual',
  'static-social-graph': 'comparison:static-social-graph', 'llm-with-memory': 'comparison:llm-with-memory',
  'genos-without-relational-physiology': 'comparison:genos-without-relational-physiology',
});
const KINDS = new Set(['persisted-memory-snapshot', 'social-model-snapshot', 'model-output', 'decision-receipt',
  'intervention-receipt', 'verified-social-memory-sources', 'authority-check']);
const SHARED_KINDS = new Map([['verified-social-memory-sources', 'source-experiences'], ['authority-check', 'seed-authority']]);
const DEFAULT_REPORT_ROOT = path.resolve(__dirname, '../../../benchmarks/social-world/campaigns/socialworld-v2/reports');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function stableJson(value) { return JSON.stringify(stable(value)); }
function stableHash(value) { return crypto.createHash('sha256').update(stableJson(value)).digest('hex'); }
function exactHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function sameStrings(left, right) {
  const sorted = Array.isArray(right) ? [...right].sort() : [];
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && [...left].sort().every((value, index) => value === sorted[index]);
}
function addError(state, message) { state.errors.push(message); }

function validRelative(relative) {
  return typeof relative === 'string' && relative.length > 0 && !relative.includes('\\')
    && !path.posix.isAbsolute(relative) && path.posix.normalize(relative) === relative;
}
function inside(root, target) {
  const rel = path.relative(root, target);
  return Boolean(rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}
function confinedFile(relative, root) {
  if (!validRelative(relative)) return null;
  const target = path.resolve(root, ...relative.split('/'));
  if (!inside(path.resolve(root), target)) return null;
  try {
    const base = fs.realpathSync(root); const real = fs.realpathSync(target);
    return inside(base, real) && fs.statSync(real).isFile() ? real : null;
  } catch { return null; }
}

function readRef(ref, owner, state) {
  if (!validRef(ref)) { addError(state, owner + ' evidence reference must have path and sha256.'); return null; }
  if (state.pathPrefix && !ref.path.startsWith(state.pathPrefix)) addError(state, 'Pilot evidence path is outside its seed folder.');
  if (state.paths.has(ref.path) && state.paths.get(ref.path) !== ref.sha256) addError(state, 'Conflicting checksums for ' + ref.path + '.');
  state.paths.set(ref.path, ref.sha256);
  if (state.artifacts.has(ref.path)) return cachedArtifact(ref.path, owner, state);
  const filename = confinedFile(ref.path, state.reportsRoot);
  if (!filename) { addError(state, 'Evidence path escapes reports: ' + ref.path); return null; }
  const artifact = readArtifact(filename, ref, state);
  if (!artifact) return null;
  verifyEnvelope({ artifact, ref, owner, state });
  state.artifacts.set(ref.path, artifact); return artifact;
}
function validRef(ref) { return Boolean(ref && typeof ref.path === 'string' && typeof ref.sha256 === 'string'); }
function cachedArtifact(file, owner, state) {
  const artifact = state.artifacts.get(file);
  checkArtifactArm({ artifact, file, owner, state });
  return artifact;
}
function readArtifact(filename, ref, state) {
  let bytes;
  try { bytes = fs.readFileSync(filename); }
  catch { addError(state, 'Evidence artifact unreadable: ' + ref.path); return null; }
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== ref.sha256) addError(state, 'Evidence checksum mismatch: ' + ref.path);
  try { return parseArtifact(bytes, ref.path, state); }
  catch { addError(state, 'Evidence artifact invalid JSON: ' + ref.path); return null; }
}
function parseArtifact(bytes, file, state) {
  const artifact = JSON.parse(bytes.toString('utf8'));
  if (!artifact || typeof artifact !== 'object' || !KINDS.has(artifact.kind)) { addError(state, 'Unsupported artifact kind: ' + file); return null; }
  return artifact;
}
function verifyEnvelope({ artifact, ref, owner, state }) {
  for (const key of ['campaignId', 'scenario', 'seed', 'attempt', 'caseId', 'sourceCommit', 'configHash']) {
    if (artifact[key] !== state.report[key]) addError(state, ref.path + ' ' + key + ' differs from report.');
  }
  checkArtifactArm({ artifact, file: ref.path, owner, state });
}
function checkArtifactArm(input) {
  const { artifact, file, owner, state } = input;
  const sharedArm = SHARED_KINDS.get(artifact.kind);
  if (owner !== 'top-level' && artifact.arm !== owner && artifact.arm !== sharedArm) addError(state, file + ' belongs to a different report arm.');
  if (!Object.prototype.hasOwnProperty.call(state.report.arms, artifact.arm) && !sharedArm) addError(state, file + ' has unknown arm identity.');
}
function artifactsFor(arm, state) { return arm.evidenceRefs.map((ref) => state.artifacts.get(ref.path)).filter(Boolean); }
function kind(items, name) { return items.filter((item) => item.kind === name); }
function memoryMap(memories, errors, armName) {
  const map = new Map();
  for (const memory of memories || []) {
    if (!memory || typeof memory.id !== 'string' || map.has(memory.id)) errors.push(armName + ' memory read-back has missing/duplicate id.');
    else map.set(memory.id, memory);
  }
  return map;
}
function entrySetHash(entries) {
  return stableHash(entries.map(({ id, classification, sourceHash }) => ({ id, classification, sourceHash })));
}

function validateSnapshots({ armName, arm, items, errors }) {
  const snapshots = kind(items, 'persisted-memory-snapshot');
  for (const item of snapshots) {
    if (item.persisted !== true || item.readBack !== true || !item.snapshotId || !Array.isArray(item.memories)) errors.push(armName + ' memory snapshot lacks persisted read-back.');
    memoryMap(item.memories, errors, armName);
  }
  if (arm.status !== 'pass') return;
  if (!snapshots.length) errors.push(armName + ' pass lacks persisted memory snapshot.');
  if (['masked', 'counterfactual'].includes(ROLES[armName])
    && !['before', 'after'].every((phase) => snapshots.some((item) => item.phase === phase))) errors.push(armName + ' needs before/after snapshots.');
}

function decisionHash(decision) {
  const r = decision.receipt;
  return stableHash({ action: decision.action, memoryReferences: decision.memoryReferences,
    contextHash: decision.contextHash, budgetHash: decision.budgetHash, permissionHash: decision.permissionHash,
    receiptId: r.receiptId, createdAt: r.createdAt, sourceCommit: r.sourceCommit, configHash: r.configHash,
    invocationId: r.invocationId, promptHash: r.promptHash });
}
function validateDecision({ armName, arm, items, report, errors }) {
  const receipts = kind(items, 'decision-receipt');
  if (receipts.length !== 1) { errors.push(armName + ' needs exactly one decision receipt artifact.'); return; }
  verifyDecisionOutput({ artifact: receipts[0], armName, arm, errors });
  verifyDecisionReceipt({ armName, arm, report, errors });
  verifyDecisionMemory({ armName, arm, items, errors });
  if (!sameFactors(arm.decision, report.sharedFactors)) errors.push(armName + ' decision factors differ.');
}
function verifyDecisionOutput({ artifact, armName, arm, errors }) {
  if (stableJson(artifact.decision) !== stableJson(arm.decision)) errors.push(armName + ' decision differs from its artifact.');
  const output = artifact.modelOutput; const provenance = artifact.modelProvenance;
  if (!decisionOutputMatches(output, arm.decision) || !validProvenance(provenance)
    || provenance.parsedOutputHash !== exactHash(output)) errors.push(armName + ' decision is not bound to the second model output/provenance.');
  if (arm.decision.receipt.invocationId !== provenance?.invocationId || arm.decision.receipt.promptHash !== provenance?.promptHash) {
    errors.push(armName + ' decision receipt does not bind the second local invocation.');
  }
}
function decisionOutputMatches(output, decision) {
  return Boolean(output && output.action === decision.action
    && stableJson(output.memoryReferences) === stableJson(decision.memoryReferences));
}
function validProvenance(provenance) {
  return Boolean(provenance && typeof provenance.provider === 'string' && typeof provenance.servedModel === 'string'
    && (provenance.responseId === null || typeof provenance.responseId === 'string')
    && validInvocation(provenance.invocationId) && validHash(provenance.promptHash)
    && provenance.provenance === 'GenOS modelProvider local invocation');
}
function verifyDecisionReceipt({ armName, arm, report, errors }) {
  const receipt = arm.decision.receipt;
  if (receipt.sourceCommit !== report.sourceCommit || receipt.configHash !== report.configHash || receipt.hash !== decisionHash(arm.decision)) errors.push(armName + ' decision receipt binding/hash is invalid.');
}
function verifyDecisionMemory({ armName, arm, items, errors }) {
  const ids = new Set(kind(items, 'persisted-memory-snapshot').flatMap((item) => item.memories || []).map((memory) => memory.id));
  if (arm.decision.memoryReferences.some((id) => !ids.has(id))) errors.push(armName + ' decision cites absent persisted memory.');
}
function sameFactors(decision, factors) {
  return ['contextHash', 'budgetHash', 'permissionHash'].every((key) => decision[key] === factors[key]);
}

function validateModel({ armName, arm, items, errors }) {
  const outputs = kind(items, 'model-output'); const snapshots = kind(items, 'social-model-snapshot');
  verifyModelOutput({ armName, arm, outputs, errors });
  verifyModelSnapshotCount({ armName, arm, snapshots, errors });
  if (!snapshots.length) return null;
  const snapshot = snapshots[0];
  verifyModelSnapshot({ armName, arm, snapshot, errors });
  verifyModelCitations({ armName, arm, snapshot, items, errors });
  return snapshot.model;
}
function verifyModelOutput({ armName, arm, outputs, errors }) {
  if ((arm.status === 'pass' || arm.model !== null) && outputs.length !== 1) errors.push(armName + ' declared model needs one model-output artifact.');
  if (outputs.length !== 1) return;
  const output = outputs[0];
  if (stableJson(output.model) !== stableJson(arm.model?.parsedOutput)) errors.push(armName + ' model differs from generated output.');
  if (!validModelProvenance(output, arm) || output.parsedOutputHash !== exactHash(output.model)) errors.push(armName + ' model output provenance/hash is invalid.');
}
function validModelProvenance(output, arm) {
  return Boolean(output.provider === arm.model?.provider && typeof output.servedModel === 'string'
    && (output.responseId === null || typeof output.responseId === 'string')
    && validInvocation(output.invocationId) && validHash(output.promptHash)
    && output.provenance === 'GenOS modelProvider local invocation');
}
function validInvocation(value) { return typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value); }
function validHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value); }
function verifyModelSnapshotCount({ armName, arm, snapshots, errors }) {
  if (snapshots.length > 1 || Boolean(arm.modelState) !== (snapshots.length === 1)) errors.push(armName + ' social model snapshot/modelState count mismatch.');
}
function verifyModelSnapshot({ armName, arm, snapshot, errors }) {
  if (snapshot.snapshotId !== arm.modelState?.snapshotId || snapshot.revision !== arm.modelState?.revision
    || snapshot.modelHash !== arm.modelState?.modelHash || !sameStrings(snapshot.sourceMemoryIds, arm.modelState?.sourceMemoryIds)) errors.push(armName + ' persisted model metadata mismatch.');
  if (snapshot.modelHash !== exactHash(snapshot.model) || !validateSocialMentalModel(snapshot.model)
    || stableJson(snapshot.model) !== stableJson(arm.model?.parsedOutput)) errors.push(armName + ' persisted social model/hash invalid.');
  if (!sameStrings(snapshot.model?.sourceMemoryIds, snapshot.sourceMemoryIds)) errors.push(armName + ' model source ids mismatch.');
}
function verifyModelCitations({ armName, arm, snapshot, items, errors }) {
  const known = new Set(kind(items, 'persisted-memory-snapshot').flatMap((item) => (item.memories || []).map((memory) => memory.id)));
  if (arm.modelState.sourceMemoryIds.some((id) => !known.has(id))) errors.push(armName + ' model cites absent persisted memory.');
  if (arm.decision?.memoryReferences.some((id) => !arm.modelState.sourceMemoryIds.includes(id))) errors.push(armName + ' decision cites memory absent from model.');
}

function compactIntervention(artifact) {
  return { interventionId: artifact.interventionId, mode: artifact.mode, removedMemoryIds: artifact.removedMemoryIds,
    addedMemoryIds: artifact.addedMemoryIds, beforeHash: artifact.before?.memorySetHash, afterHash: artifact.after?.memorySetHash,
    preservedNonSocialMemoryHash: artifact.preservedNonSocialMemoryHash };
}
function validateIntervention({ armName, arm, items, errors }) {
  const wrappers = kind(items, 'intervention-receipt');
  if (wrappers.length !== 1) { errors.push(armName + ' needs exactly one intervention artifact.'); return null; }
  const wrapper = wrappers[0]; const artifact = wrapper.artifact; const receipt = wrapper.receipt;
  if (wrapper.readBack !== true || !receipt || receipt.schema !== 'genos.social-memory-intervention-receipt/v1'
    || artifact?.schema !== 'genos.social-memory-intervention-artifact/v1') { errors.push(armName + ' intervention lacks verified runtime replay.'); return null; }
  verifyInterventionIdentity({ armName, wrapper, artifact, errors });
  verifyRuntimeReceipt({ armName, artifact, receipt, errors });
  verifyInterventionDeclaration({ armName, wrapper, artifact, arm, errors });
  validateInterventionPayload(armName, artifact, errors);
  validateInterventionSnapshots({ armName, artifact, items, errors });
  return artifact;
}
function verifyInterventionIdentity({ armName, wrapper, artifact, errors }) {
  if (artifact.arm !== armName || artifact.seed !== wrapper.seed || artifact.sourceCommit !== wrapper.sourceCommit
    || artifact.configHash !== wrapper.configHash) errors.push(armName + ' inner intervention identity differs from artifact envelope.');
}
function verifyRuntimeReceipt({ armName, artifact, receipt, errors }) {
  const artifactHash = stableHash(artifact);
  const receiptId = 'sha256:' + stableHash({ interventionId: receipt.interventionId, artifactHash: receipt.artifactHash });
  const validReceipt = receipt.verification === 'content-addressed-db-replay' && receipt.artifactHash === artifactHash
    && receipt.receiptId === receiptId && receipt.interventionId === artifact.interventionId;
  const validScope = stableJson(receipt.sourceReceiptRefs) === stableJson(artifact.sourceReceiptRefs)
    && receipt.scope?.organizationId === artifact.organizationId && receipt.scope?.projectId === artifact.projectId;
  if (!validReceipt || !validScope) errors.push(armName + ' runtime receipt hash/binding invalid.');
}
function verifyInterventionDeclaration({ armName, wrapper, artifact, arm, errors }) {
  if (stableJson(wrapper.before) !== stableJson(artifact.before?.entries) || stableJson(wrapper.after) !== stableJson(artifact.after?.entries)) errors.push(armName + ' wrapper read-back differs from runtime artifact.');
  if (stableJson(compactIntervention(artifact)) !== stableJson(arm.interventionReceipt)) errors.push(armName + ' compact intervention differs from runtime artifact.');
}
function validateInterventionPayload(armName, artifact, errors) {
  const role = ROLES[armName]; const mode = role === 'masked' ? 'mask-social-memories' : 'counterfactual-social-memories';
  if (artifact.arm !== armName || artifact.mode !== mode) errors.push(armName + ' intervention mode/identity invalid.');
  const before = artifact.before?.entries || []; const after = artifact.after?.entries || [];
  verifyEntrySets({ armName, artifact, before, after, errors });
  verifyEntryDelta({ armName, role, artifact, before, after, errors });
}
function verifyEntrySets({ armName, artifact, before, after, errors }) {
  if (!sameStrings(artifact.before?.memoryIds, before.map((entry) => entry.id)) || !sameStrings(artifact.after?.memoryIds, after.map((entry) => entry.id))) errors.push(armName + ' intervention ids differ from entries.');
  if (artifact.before?.memorySetHash !== entrySetHash(before) || artifact.after?.memorySetHash !== entrySetHash(after)) errors.push(armName + ' intervention set hashes invalid.');
}
function verifyEntryDelta({ armName, role, artifact, before, after, errors }) {
  const beforeIds = new Set(before.map((entry) => entry.id)); const afterIds = new Set(after.map((entry) => entry.id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id)).sort(); const added = [...afterIds].filter((id) => !beforeIds.has(id)).sort();
  if (!sameStrings(removed, artifact.removedMemoryIds) || !sameStrings(added, artifact.addedMemoryIds)) errors.push(armName + ' intervention delta invalid.');
  if (role === 'masked' && after.some((entry) => entry.classification === 'social')) errors.push('Masked replay retains social memories.');
  if (role === 'counterfactual' && added.length !== removed.length) errors.push('Counterfactual replacement count mismatch.');
}
function validateInterventionSnapshots({ armName, artifact, items, errors }) {
  const snapshots = kind(items, 'persisted-memory-snapshot');
  const before = snapshots.find((item) => item.phase === 'before'); const after = snapshots.find((item) => item.phase === 'after');
  if (!before || !after) { errors.push(armName + ' intervention lacks before/after database snapshots.'); return; }
  if (stableJson(before.memories) !== stableJson(artifact.before.entries) || stableJson(after.memories) !== stableJson(artifact.after.entries)) errors.push(armName + ' intervention differs from persisted read-back snapshots.');
  const preserved = artifact.preservedNonSocialMemoryIds || [];
  const beforeMap = memoryMap(before.memories, errors, armName); const afterMap = memoryMap(after.memories, errors, armName);
  const nonSocial = preserved.map((id) => beforeMap.get(id)); const replay = preserved.map((id) => afterMap.get(id));
  if (nonSocial.some((item) => !item) || replay.some((item) => !item)
    || stableJson(nonSocial) !== stableJson(replay) || entrySetHash(nonSocial) !== artifact.preservedNonSocialMemoryHash) errors.push(armName + ' preserved non-social memory failed read-back.');
}

function validateOneArm({ armName, arm, report, state }) {
  const items = artifactsFor(arm, state);
  validateSnapshots({ armName, arm, items, errors: state.errors });
  const model = validateModel({ armName, arm, items, errors: state.errors });
  validateArmDecision({ armName, arm, items, report, errors: state.errors });
  validateArmIntervention({ armName, arm, items, errors: state.errors });
  validateRoleEvidence({ armName, arm, items, model, state });
}
function validateArmDecision({ armName, arm, items, report, errors }) {
  if (arm.decision) validateDecision({ armName, arm, items, report, errors });
  else if (arm.status === 'pass') errors.push(armName + ' pass lacks decision.');
}
function validateArmIntervention({ armName, arm, items, errors }) {
  const hasArtifact = kind(items, 'intervention-receipt').length > 0;
  if (arm.interventionReceipt && hasArtifact) validateIntervention({ armName, arm, items, errors });
  else if (hasArtifact) errors.push(armName + ' has undeclared intervention artifact.');
  else if (arm.status === 'pass' && ['masked', 'counterfactual'].includes(ROLES[armName])) errors.push(armName + ' pass lacks intervention receipt.');
}
function validateRoleEvidence({ armName, arm, items, model, state }) {
  const errors = state.errors;
  if (arm.status === 'pass' && ['baseline', 'masked', 'counterfactual'].includes(ROLES[armName]) && !arm.modelState) errors.push(armName + ' pass needs persisted modelState.');
  if (ROLES[armName] === 'masked' && arm.status === 'pass') validateMasked({ model, arm, items, errors });
  if (ROLES[armName] === 'baseline' && arm.status === 'pass') validateBaseline(model, state.caseData, errors);
}
function validateMasked({ model, arm, items, errors }) {
  const intervention = kind(items, 'intervention-receipt')[0]?.artifact;
  const receiptId = kind(items, 'intervention-receipt')[0]?.receipt?.receiptId;
  if (!noSocialEntries(intervention) || !noMaskedIds(arm) || !unknownStatesModel(model, receiptId)) errors.push('Masked arm must show verified social absence, explicit unknown and no hidden IDs.');
}
function noSocialEntries(intervention) { return intervention?.after?.entries?.every((entry) => entry.classification !== 'social'); }
function noMaskedIds(arm) { return !arm.modelState.sourceMemoryIds.length && !arm.decision.memoryReferences.length; }
function unknownStatesModel(model, receiptId) {
  const citesAbsence = model?.unknowns?.some((entry) => entry.includes(receiptId));
  const hasUnknown = model?.relationHypotheses?.some((entry) => entry.relationType === 'unknown');
  const citesNoIds = model?.relationHypotheses?.every((entry) => !entry.supportingMemoryIds.length && !entry.contradictingMemoryIds.length);
  return citesAbsence && hasUnknown && citesNoIds;
}
function validateBaseline(model, caseData, errors) {
  const minimum = caseData.minimumIndependentMemories || 4;
  if (new Set(model?.sourceMemoryIds || []).size < minimum || !model?.unknowns?.length
    || !model?.beliefsAboutOther?.length || !model?.alternativeInterpretations?.length) errors.push('Baseline model lacks required independent evidence (minimum ' + minimum + ').');
}

function verifyV2Evidence(report, options = {}) {
  const state = { report, errors: [], artifacts: new Map(), paths: new Map(),
    reportsRoot: options.reportsRoot || DEFAULT_REPORT_ROOT, caseData: options.caseData || {}, pathPrefix: options.pathPrefix || '' };
  for (const ref of report.evidenceRefs) readRef(ref, 'top-level', state);
  const entries = Object.entries(report.arms);
  readArmReferences(entries, state);
  compareReferenceUnion(report, entries, state);
  validateArms(report, entries, state);
  verifyCampaignSourceEvidence(state);
  return { valid: !state.errors.length, errors: state.errors,
    artifactsByArm: Object.fromEntries(entries.map(([name, arm]) => [name, artifactsFor(arm, state)])),
    comparisonObservations: entries.filter(([name]) => ROLES[name].startsWith('comparison:')).map(([arm, item]) => ({ arm, status: item.status, action: item.decision?.action || null })) };
}
function readArmReferences(entries, state) {
  for (const [armName, arm] of entries) for (const ref of arm.evidenceRefs) readRef(ref, armName, state);
}
function compareReferenceUnion(report, entries, state) {
  const union = new Map(entries.flatMap(([, arm]) => arm.evidenceRefs).map((ref) => [ref.path, ref.sha256]));
  const top = new Map(report.evidenceRefs.map((ref) => [ref.path, ref.sha256]));
  if (union.size !== top.size || [...union].some(([filename, checksum]) => top.get(filename) !== checksum)) addError(state, 'Top evidenceRefs must exactly equal per-arm reference union.');
}
function validateArms(report, entries, state) {
  for (const [name, arm] of entries) validateOneArm({ armName: name, arm, report, state });
}

module.exports = { verifyV2Evidence, stableHash, sameStrings };

