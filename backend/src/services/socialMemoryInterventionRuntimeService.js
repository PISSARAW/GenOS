'use strict';

const { digest } = require('./biologicalIntegrity');

function fail(code, message) { throw Object.assign(new Error(message), { code }); }

function sourceEntry(memory) {
  return { id: memory.id, classification: 'social', sourceHash: digest(memory),
    sourceReceiptId: memory.sourceReceiptId, sessionId: memory.sessionId,
    memory: { id: memory.id, subjectAgentId: memory.subjectAgentId, otherAgentId: memory.otherAgentId,
      relationType: memory.relationType, polarity: memory.polarity, statement: memory.statement,
      sourceMemoryIds: [memory.id] } };
}

async function otherEpisodes(db, context) {
  const { input, scope, sourceSessions } = context;
  const store = require('./autobiographicalMemory/episodeStore');
  const episodes = await store.getRecentEpisodes({ agentId: input.subjectAgentId,
    organizationId: scope.organizationId, projectId: scope.projectId, limit: 500 }, db);
  return episodes.filter((episode) => !sourceSessions.has(episode.missionId)).map((episode) => ({
    id: episode.id, classification: episode.kind === 'social_dialogue' ? 'other-social' : 'non-social',
    sourceHash: digest(episode), episodeId: episode.id, missionId: episode.missionId, kind: episode.kind,
  })).sort((left, right) => left.id.localeCompare(right.id));
}

async function beforeEntries(db, context) {
  const { input, loaded, scope } = context;
  const selected = loaded.socialMemories.map(sourceEntry);
  const sourceSessions = new Set(loaded.socialMemories.map((memory) => memory.sessionId));
  const other = await otherEpisodes(db, { input, scope, sourceSessions });
  return [...selected, ...other].sort((left, right) => left.id.localeCompare(right.id));
}

function invalidReplacementIdentity(memory, pair, ids) {
  return !memory || typeof memory.id !== 'string' || !memory.id.trim() || ids.has(memory.id)
    || memory.subjectAgentId !== pair.subjectAgentId || memory.otherAgentId !== pair.otherAgentId;
}

function invalidReplacementContent(memory) {
  return !['supports', 'contradicts'].includes(memory.polarity)
    || typeof memory.relationType !== 'string' || !memory.relationType.trim()
    || typeof memory.statement !== 'string' || !memory.statement.trim();
}

function validateReplacement(memory, pair, ids) {
  if (invalidReplacementIdentity(memory, pair, ids)) {
    fail('SOCIAL_INTERVENTION_INVALID', 'Counterfactual memory IDs must be non-empty and unique.');
  }
  if (invalidReplacementContent(memory)) {
    fail('SOCIAL_INTERVENTION_INVALID', 'Counterfactual memory needs explicit social content.');
  }
}

function replacementEntry(memory, selectedEntry) {
  return { id: memory.id, classification: 'social', sourceHash: digest(memory),
    derivedFromMemoryId: selectedEntry.id, source: 'explicit-counterfactual-intervention', memory };
}

function replacementEntries(input, context) {
  const { pair, selected } = context;
  const replacements = input.replacementMemories || [];
  if (input.mode !== 'counterfactual-social-memories') {
    if (replacements.length) fail('SOCIAL_INTERVENTION_INVALID', 'Only the counterfactual arm may add replacement memories.');
    return [];
  }
  if (replacements.length !== selected.length) fail('SOCIAL_INTERVENTION_INVALID', 'Counterfactual arm needs one replacement per selected event.');
  const ids = new Set();
  return replacements.map((memory, index) => {
    validateReplacement(memory, pair, ids);
    ids.add(memory.id);
    return replacementEntry(memory, selected[index]);
  });
}

function validateSelection(input, pair, before) {
  const allSocial = before.filter((entry) => entry.classification === 'social');
  const selectedIds = input.selectedMemoryIds || [];
  if (input.mode === 'baseline') {
    if (selectedIds.length) fail('SOCIAL_INTERVENTION_INVALID', 'Baseline may not remove source memories.');
    return [];
  }
  const selected = [...new Set(selectedIds)].map((id) => allSocial.find((entry) => entry.id === id));
  if (selected.length !== allSocial.length || selected.some((entry) => !entry)
      || new Set(selectedIds).size !== selectedIds.length) {
    fail('SOCIAL_INTERVENTION_SCOPE_INVALID', 'Intervention must select exactly all persisted social memories in the target set.');
  }
  if (selected.some((entry) => entry.memory?.subjectAgentId !== pair.subjectAgentId
      || entry.memory?.otherAgentId !== pair.otherAgentId)) {
    fail('SOCIAL_INTERVENTION_SCOPE_INVALID', 'Intervention cannot mask another pair or non-social memory.');
  }
  return selected;
}

function entryHash(entries) { return digest(entries.map(({ id, classification, sourceHash }) => ({ id, classification, sourceHash }))); }

function artifactFor(input, state) {
  const { pair, before, selected, replacements } = state;
  const removedIds = selected.map((entry) => entry.id).sort();
  const after = [...before.filter((entry) => !removedIds.includes(entry.id)), ...replacements]
    .sort((left, right) => left.id.localeCompare(right.id));
  const nonSocial = before.filter((entry) => entry.classification === 'non-social');
  const afterNonSocial = after.filter((entry) => entry.classification === 'non-social');
  const nonSocialHash = entryHash(nonSocial);
  if (nonSocialHash !== entryHash(afterNonSocial)) fail('SOCIAL_INTERVENTION_NON_SOCIAL_CHANGED', 'Non-social memory set must remain byte-for-byte stable.');
  return { schema: 'genos.social-memory-intervention-artifact/v1', interventionId: input.interventionId,
    arm: input.arm, seed: input.seed, sourceCommit: input.sourceCommit, configHash: input.configHash,
    organizationId: input.organizationId, projectId: input.projectId,
    subjectAgentId: pair.subjectAgentId, otherAgentId: pair.otherAgentId, mode: input.mode,
    minimumIndependentMemories: input.minimumIndependentMemories || 4,
    requiredPolarityCounts: input.requiredPolarityCounts || { supports: 2, contradicts: 2 },
    before: { memoryIds: before.map((entry) => entry.id), memorySetHash: entryHash(before), entries: before },
    after: { memoryIds: after.map((entry) => entry.id), memorySetHash: entryHash(after), entries: after },
    removedMemoryIds: removedIds, addedMemoryIds: replacements.map((entry) => entry.id).sort(),
    preservedNonSocialMemoryIds: nonSocial.map((entry) => entry.id).sort(),
    preservedNonSocialMemoryHash: nonSocialHash,
    preservedOtherMemoryHash: entryHash(before.filter((entry) => !removedIds.includes(entry.id))),
    sourceReceiptRefs: before.filter((entry) => entry.classification === 'social').map((entry) => entry.sourceReceiptId).sort(),
    createdAt: new Date().toISOString() };
}

function receiptFor(artifact) {
  const artifactHash = digest(artifact);
  const receipt = { schema: 'genos.social-memory-intervention-receipt/v1',
    receiptId: `sha256:${digest({ interventionId: artifact.interventionId, artifactHash })}`,
    interventionId: artifact.interventionId, artifactHash,
    verification: 'content-addressed-db-replay', scope: { organizationId: artifact.organizationId,
      projectId: artifact.projectId }, sourceReceiptRefs: artifact.sourceReceiptRefs };
  return { artifactHash, receipt, receiptHash: digest(receipt) };
}

async function createPersistedSocialMemoryIntervention(db, input = {}) {
  const runtime = require('./socialMentalModelRuntimeService');
  const scope = { organizationId: input.organizationId, projectId: input.projectId };
  const loaded = await runtime.loadVerifiedSocialMemories(db, { ...scope,
    subjectAgentId: input.subjectAgentId, otherAgentId: input.otherAgentId,
    minimumIndependent: input.minimumIndependentMemories,
    requiredPolarityCounts: input.requiredPolarityCounts });
  const pair = { subjectAgentId: loaded.subjectAgentId, otherAgentId: loaded.otherAgentId };
  const before = await beforeEntries(db, { input, loaded, scope });
  const selected = validateSelection(input, pair, before);
  const replacements = replacementEntries(input, { pair, selected });
  const artifact = artifactFor(input, { pair, before, selected, replacements });
  const { artifactHash, receipt, receiptHash } = receiptFor(artifact);
  await runtime.ensureTables(db);
  await db.run(`INSERT OR IGNORE INTO social_memory_intervention_artifacts
    (intervention_id,organization_id,project_id,subject_agent_id,other_agent_id,arm,seed,artifact_json,artifact_hash,receipt_json,receipt_hash)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, input.interventionId, scope.organizationId, scope.projectId,
  pair.subjectAgentId, pair.otherAgentId, input.arm, String(input.seed), JSON.stringify(artifact),
  artifactHash, JSON.stringify(receipt), receiptHash);
  const stored = await db.get('SELECT artifact_hash,receipt_hash,artifact_json,receipt_json FROM social_memory_intervention_artifacts WHERE intervention_id=?', input.interventionId);
  if (!stored || stored.artifact_hash !== artifactHash || stored.receipt_hash !== receiptHash) {
    fail('SOCIAL_INTERVENTION_READBACK_FAILED', 'Intervention artifact and receipt did not read back exactly.');
  }
  return { artifact, receipt, beforeMemories: artifact.before.entries, afterMemories: artifact.after.entries,
    memories: artifact.after.entries.filter((entry) => entry.classification === 'social').map((entry) => entry.memory),
    readBack: stored.artifact_json === JSON.stringify(artifact) && stored.receipt_json === JSON.stringify(receipt) };
}

function verifyStoredArtifact(row) {
  const artifact = JSON.parse(row.artifact_json);
  const receipt = JSON.parse(row.receipt_json);
  const { artifactHash, receipt: expected, receiptHash } = receiptFor(artifact);
  if (artifactHash !== row.artifact_hash || receiptHash !== row.receipt_hash
      || digest(receipt) !== row.receipt_hash || digest(expected) !== row.receipt_hash) {
    fail('SOCIAL_INTERVENTION_RECEIPT_INVALID', 'Stored intervention content-addressed receipt failed verification.');
  }
  if (artifact.before.memorySetHash !== entryHash(artifact.before.entries)
      || artifact.after.memorySetHash !== entryHash(artifact.after.entries)) {
    fail('SOCIAL_INTERVENTION_SET_HASH_INVALID', 'Intervention before/after set hashes do not replay.');
  }
  return { artifact, receipt };
}

async function verifyPersistedSocialMemoryIntervention(db, input = {}) {
  const runtime = require('./socialMentalModelRuntimeService');
  const scope = { organizationId: input.organizationId, projectId: input.projectId };
  const row = await db.get(`SELECT * FROM social_memory_intervention_artifacts WHERE intervention_id=?
    AND organization_id=? AND project_id=?`, input.interventionId, scope.organizationId, scope.projectId);
  if (!row) fail('SOCIAL_INTERVENTION_NOT_FOUND', 'Persisted intervention artifact was not found in this scope.');
  const { artifact, receipt } = verifyStoredArtifact(row);
  const loaded = await runtime.loadVerifiedSocialMemories(db, { ...scope,
    subjectAgentId: artifact.subjectAgentId, otherAgentId: artifact.otherAgentId,
    minimumIndependent: artifact.minimumIndependentMemories,
    requiredPolarityCounts: artifact.requiredPolarityCounts });
  const currentIds = loaded.socialMemories.map((memory) => memory.id).sort();
  if (digest(currentIds) !== digest(artifact.before.entries.filter((entry) => entry.classification === 'social').map((entry) => entry.id).sort())) {
    fail('SOCIAL_INTERVENTION_SOURCE_REPLAY_FAILED', 'Intervention social sources no longer match current verified DB rows.');
  }
  return { valid: true, artifact, receipt, evidenceRefs: [receipt.receiptId, ...artifact.sourceReceiptRefs] };
}

module.exports = { createPersistedSocialMemoryIntervention, verifyPersistedSocialMemoryIntervention };
