'use strict';

const { digest, identity } = require('./biologicalIntegrity');
const store = require('./socialMentalModelStore');
const modelService = require('./socialMentalModelService');

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) fail('SOCIAL_MEMORY_INVALID', `${name} required`);
  return value.trim();
}

function scopeOf(input) {
  return { organizationId: text(input.organizationId, 'organizationId'), projectId: text(input.projectId, 'projectId') };
}

function pairOf(input) {
  const pair = { subjectAgentId: text(input.subjectAgentId, 'subjectAgentId'), otherAgentId: text(input.otherAgentId, 'otherAgentId') };
  if (pair.subjectAgentId === pair.otherAgentId) fail('SOCIAL_MEMORY_IDENTITY_MISMATCH', 'Distinct participants required');
  return pair;
}

async function ensureTables(db) {
  await require('../db/migrations/migrateSocialMentalModels').migrateSocialMentalModels(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS social_mental_model_source_memories (
    memory_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    subject_agent_id TEXT NOT NULL, other_agent_id TEXT NOT NULL, session_id TEXT NOT NULL,
    source_event_hash TEXT NOT NULL, source_receipt_id TEXT NOT NULL, source_receipt_hash TEXT NOT NULL,
    memory_json TEXT NOT NULL, memory_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id,project_id,session_id), UNIQUE(organization_id,project_id,source_receipt_id),
    CHECK(subject_agent_id<>other_agent_id));
    CREATE INDEX IF NOT EXISTS idx_social_model_dialogue_pair ON social_mental_model_source_memories(organization_id,project_id,subject_agent_id,other_agent_id);
    CREATE TABLE IF NOT EXISTS social_memory_intervention_artifacts (
    intervention_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    subject_agent_id TEXT NOT NULL, other_agent_id TEXT NOT NULL, arm TEXT NOT NULL, seed TEXT NOT NULL,
    artifact_json TEXT NOT NULL, artifact_hash TEXT NOT NULL, receipt_json TEXT NOT NULL, receipt_hash TEXT NOT NULL,
    CHECK(subject_agent_id<>other_agent_id));
    CREATE TRIGGER IF NOT EXISTS immutable_social_source_memory_update BEFORE UPDATE ON social_mental_model_source_memories BEGIN SELECT RAISE(ABORT,'SOCIAL_MEMORY_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_social_source_memory_delete BEFORE DELETE ON social_mental_model_source_memories BEGIN SELECT RAISE(ABORT,'SOCIAL_MEMORY_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_social_intervention_update BEFORE UPDATE ON social_memory_intervention_artifacts BEGIN SELECT RAISE(ABORT,'SOCIAL_INTERVENTION_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS immutable_social_intervention_delete BEFORE DELETE ON social_memory_intervention_artifacts BEGIN SELECT RAISE(ABORT,'SOCIAL_INTERVENTION_IMMUTABLE'); END;`);
}

function turnRef(sessionId, turn) { return `dialogue:${sessionId}:turn:${turn.seq}`; }

function invocationIdentity(receipt) { return receipt?.invocationId || receipt?.runnerInvocationId; }

function invalidInvocation(receipt, invocationId, usedIds) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return !receipt || !uuid.test(invocationId || '') || usedIds.has(invocationId);
}

function invalidInvocationHashes(receipt) {
  const sha256 = /^[0-9a-f]{64}$/i;
  return !sha256.test(receipt?.promptHash || '') || !sha256.test(receipt?.contentHash || '');
}

function validateInvocation(turn, receipt, usedIds) {
  const invocationId = invocationIdentity(receipt);
  if (invalidInvocation(receipt, invocationId, usedIds) || receipt.provider !== 'ollama'
      || !receipt.servedModel?.trim() || invalidInvocationHashes(receipt)
      || receipt.contentHash !== digest(turn.utterance)) {
    fail('SOCIAL_MEMORY_PROVIDER_PROVENANCE_INVALID', 'Invocation ID, prompt hash, Ollama model, distinctness or stored utterance hash is invalid.');
  }
  usedIds.add(invocationId);
  return { seq: turn.seq, speakerAgentId: turn.speaker, provider: 'ollama', servedModel: receipt.servedModel.trim(),
    invocationId, promptHash: receipt.promptHash, contentHash: receipt.contentHash,
    provenance: 'genos-modelProvider-local-invocation' };
}

function validateInvocationReceipts(turns, declared) {
  if (!Array.isArray(declared) || declared.length !== turns.length) {
    fail('SOCIAL_MEMORY_PROVIDER_PROVENANCE_MISSING', 'Every stored turn requires a GenOS modelProvider invocation record.');
  }
  const usedIds = new Set();
  return turns.map((turn) => validateInvocation(turn, declared.find((item) => item.seq === turn.seq), usedIds));
}

function validateSession(session, pair) {
  const valid = session?.status === 'resolved' && session.participants.length === 2
    && session.participants.includes(pair.subjectAgentId) && session.participants.includes(pair.otherAgentId)
    && session.turns.length >= 2 && new Set(session.turns.map((turn) => turn.speaker)).size === 2;
  if (!valid) fail('SOCIAL_MEMORY_DIALOGUE_UNRESOLVED', 'Resolved dialogue with both participants required');
}

function getObservation(session) {
  const observation = session.artifact?.content?.socialObservation;
  if (!observation || !['supports', 'contradicts'].includes(observation.polarity)) {
    fail('SOCIAL_MEMORY_ARTIFACT_INVALID', 'Social observation missing');
  }
  return observation;
}

function validateTurnEvidence(session, observation) {
  const refs = new Set(observation.evidenceRefs || []);
  const speakers = new Set(session.turns.filter((turn) => refs.has(turnRef(session.id, turn))).map((turn) => turn.speaker));
  const artifactRefs = new Set(session.artifact.content.evidenceRefs || []);
  if (speakers.size !== 2 || session.turns.some((turn) => !artifactRefs.has(turnRef(session.id, turn)))) {
    fail('SOCIAL_MEMORY_EVIDENCE_INCOMPLETE', 'Artifact must reference persisted turns from both speakers');
  }
  return [...refs];
}

function createMemory(session, context) {
  const { pair, observation, refs, occurredAt } = context;
  return { id: identity(['genos.social-dialogue-memory/v1', session.id]), sessionId: session.id,
    ...pair, classification: 'social', relationType: text(observation.relationType, 'relationType'),
    polarity: observation.polarity, statement: text(observation.statement, 'statement'), occurredAt,
    evidenceRefs: refs, beliefAboutOther: observation.beliefAboutOther || null };
}

async function readParticipantEpisodes(db, session, scope) {
  const episodeStore = require('./autobiographicalMemory/episodeStore');
  const episodes = [];
  for (const agentId of session.participants) {
    const matches = await episodeStore.getRecentEpisodes({ agentId, missionId: session.id, kind: 'social_dialogue',
      organizationId: scope.organizationId, projectId: scope.projectId, limit: 10 }, db);
    if (matches.length !== 1) fail('SOCIAL_MEMORY_EPISODE_READBACK_FAILED', 'Expected unique dialogue episode');
    const episode = await episodeStore.getEpisodeById(matches[0].id, db);
    validateEpisode(episode, { agentId, session, scope });
    episodes.push(episode);
  }
  if (new Set(episodes.map((episode) => episode.id)).size !== 2) fail('SOCIAL_MEMORY_EPISODE_IDENTITY_COLLISION', 'Participant episodes must be distinct.');
  return episodes;
}

function validateEpisode(episode, context) {
  const { agentId, session, scope } = context;
  if (!episode || episode.agentId !== agentId || episode.outcome?.status !== 'resolved_dialogue'
      || episode.organizationId !== scope.organizationId || episode.projectId !== scope.projectId) {
    fail('SOCIAL_MEMORY_EPISODE_READBACK_FAILED', 'Episode scope/status mismatch');
  }
  const expected = [...new Set([...(session.artifact.content.evidenceRefs || []),
    ...session.turns.map((turn) => turnRef(session.id, turn))])].sort();
  const actual = [...new Set(episode.outcome.evidenceRefs || [])].sort();
  if (digest(actual) !== digest(expected)) {
    fail('SOCIAL_MEMORY_EPISODE_PROVENANCE_MISMATCH', 'Episode refs do not replay the dialogue evidence.');
  }
}

function createSourceReceipt(context) {
  const { session, scope, pair, memory, episodes, invocationReceipts } = context;
  const socialExtractionReceipt = session.artifact.content.socialObservation.socialExtraction?.receipt || null;
  const source = { schema: 'genos.social-dialogue-memory-replay/v1', sessionId: session.id, scope,
    participants: pair, sessionHash: digest({ id: session.id, status: session.status, participants: session.participants }),
    turnsHash: digest(session.turns), artifactHash: digest(session.artifact), invocationReceipts,
    socialExtractionReceipt,
    episodeIds: episodes.map((episode) => episode.id), episodeHashes: episodes.map((episode) => digest(episode)),
    memoryHash: digest(memory) };
  const receiptHash = digest(source);
  return { ...source, receiptId: `sha256:${receiptHash}`, receiptHash, verification: 'content-addressed-db-replay',
    trustOrigin: 'Persisted dialogue rows, artifacts and participant episode readbacks; GenOS modelProvider local invocation metadata is declared by runner and bound to prompt and exact stored turn hashes, without upstream provider signature.' };
}

async function replayDialogue(db, input) {
  const scope = scopeOf(input);
  const pair = pairOf(input);
  await require('./communication/verbalEscalationService').ensureVerbalTables(db);
  const session = await require('./communication/dialogueSessionService').getSession({
    db, escalationId: text(input.sessionId, 'sessionId') });
  validateSession(session, pair);
  const timing = await db.get('SELECT updated_at FROM verbal_escalations WHERE id=?', session.id);
  const observation = getObservation(session);
  const refs = validateTurnEvidence(session, observation);
  const invocationReceipts = validateInvocationReceipts(session.turns, session.artifact.content.modelTurnReceipts);
  const memory = createMemory(session, { pair, observation, refs,
    occurredAt: timing?.updated_at || new Date(0).toISOString() });
  const episodes = await readParticipantEpisodes(db, session, scope);
  const receipt = createSourceReceipt({ session, scope, pair, memory, episodes, invocationReceipts });
  return { scope, pair, session, memory, episodes, receipt,
    eventHash: digest({ session, turns: session.turns, artifact: session.artifact }) };
}

async function insertSourceMemory(db, replay) {
  const { scope, pair, session, memory, receipt, eventHash } = replay;
  const memoryHash = digest(memory);
  const receiptHash = digest(receipt);
  await db.run(`INSERT OR IGNORE INTO social_mental_model_source_memories
    (memory_id,organization_id,project_id,subject_agent_id,other_agent_id,session_id,source_event_hash,
     source_receipt_id,source_receipt_hash,memory_json,memory_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  memory.id, scope.organizationId, scope.projectId, pair.subjectAgentId, pair.otherAgentId, session.id,
  eventHash, receipt.receiptId, receiptHash, JSON.stringify(memory), memoryHash);
  return { memoryHash, receiptHash };
}

function verifyInsertedMemory(row, replay, hashes) {
  const memoryJson = JSON.stringify(replay.memory);
  const receiptHash = digest(replay.receipt);
  if (!row || row.memory_hash !== hashes.memoryHash || row.memory_json !== memoryJson
      || row.source_receipt_id !== replay.receipt.receiptId || row.source_receipt_hash !== receiptHash
      || row.source_event_hash !== replay.eventHash || hashes.receiptHash !== receiptHash) {
    fail('SOCIAL_MEMORY_READBACK_FAILED', 'Persisted source memory readback mismatch');
  }
  return { memoryId: row.memory_id, eventId: row.session_id, receiptId: replay.receipt.receiptId,
    receiptHash, sourceEventHash: replay.eventHash, memoryHash: hashes.memoryHash,
    memory: replay.memory, receipt: replay.receipt, participantEpisodes: replay.episodes,
    sourceEvent: { session: replay.session, turns: replay.session.turns, artifact: replay.session.artifact },
    persisted: true, readBack: true };
}

async function recordVerifiedSocialMemory(db, input) {
  await ensureTables(db);
  const replay = await replayDialogue(db, input);
  const hashes = await insertSourceMemory(db, replay);
  const row = await db.get(`SELECT * FROM social_mental_model_source_memories
    WHERE session_id=? AND organization_id=? AND project_id=?`, replay.session.id,
  replay.scope.organizationId, replay.scope.projectId);
  return verifyInsertedMemory(row, replay, hashes);
}

async function readSourceMemory(db, row, context) {
  const { scope, pair } = context;
  const memory = JSON.parse(row.memory_json);
  const replay = await replayDialogue(db, { ...scope, ...pair, sessionId: row.session_id });
  const valid = digest(memory) === row.memory_hash && digest(replay.memory) === row.memory_hash
    && memory.subjectAgentId === row.subject_agent_id && memory.otherAgentId === row.other_agent_id
    && memory.sessionId === row.session_id && replay.eventHash === row.source_event_hash
    && replay.receipt.receiptId === row.source_receipt_id && digest(replay.receipt) === row.source_receipt_hash;
  if (!valid) fail('SOCIAL_MEMORY_SOURCE_REPLAY_MISMATCH', 'Persisted memory fails source replay');
  return { ...memory, receiptId: row.source_receipt_id, sourceReceiptId: row.source_receipt_id,
    sourceReceiptHash: row.source_receipt_hash, episodeIds: replay.episodes.map((episode) => episode.id) };
}

function requireIndependentSources(memories, minimum, requiredPolarityCounts) {
  const enough = memories.length >= minimum && new Set(memories.map((memory) => memory.sessionId)).size === memories.length;
  const polarity = memories.filter((memory) => memory.polarity === 'supports').length >= requiredPolarityCounts.supports
    && memories.filter((memory) => memory.polarity === 'contradicts').length >= requiredPolarityCounts.contradicts;
  const episodes = new Set(memories.flatMap((memory) => memory.episodeIds));
  if (!enough || !polarity || episodes.size !== memories.length * 2) {
    fail('SOCIAL_MEMORY_INDEPENDENCE_REQUIRED', 'Need independent dialogues with two supports and two contradictions.');
  }
}

async function loadVerifiedSocialMemories(db, input) {
  await ensureTables(db);
  const scope = scopeOf(input);
  const pair = pairOf(input);
  const rows = await db.all(`SELECT * FROM social_mental_model_source_memories
    WHERE organization_id=? AND project_id=? AND subject_agent_id=? AND other_agent_id=? ORDER BY created_at,memory_id`,
  scope.organizationId, scope.projectId, pair.subjectAgentId, pair.otherAgentId);
  const memories = [];
  for (const row of rows) memories.push(await readSourceMemory(db, row, { scope, pair }));
  requireIndependentSources(memories, Number.isInteger(input.minimumIndependent) ? input.minimumIndependent : 4,
    input.requiredPolarityCounts || { supports: 2, contradicts: 2 });
  return { ...pair, memories, socialMemories: memories, nonSocialMemories: [] };
}

async function buildPersistedSocialMentalModel(db, input) {
  const loaded = await loadVerifiedSocialMemories(db, input);
  const scope = scopeOf(input);
  const model = modelService.buildSocialMentalModel({ subjectAgentId: loaded.subjectAgentId,
    otherAgentId: loaded.otherAgentId, memories: loaded.socialMemories, generatedAt: input.generatedAt });
  const snapshot = await store.persistSocialMentalModel(db, { ...scope, snapshotId: text(input.snapshotId, 'snapshotId'),
    subjectAgentId: loaded.subjectAgentId, otherAgentId: loaded.otherAgentId, revision: input.revision,
    model, sourceMemoryIds: model.sourceMemoryIds });
  return { snapshot, memories: loaded.socialMemories, sourceReadback: sourceReadback(loaded.socialMemories) };
}

function sourceReadback(memories) {
  return { memoryIds: memories.map((memory) => memory.id), eventIds: memories.map((memory) => memory.sessionId),
    receiptIds: memories.map((memory) => memory.receiptId), memorySetHash: digest(memories), readBack: true };
}

function validateModelSources(model, context) {
  const { pair, artifact, receipt } = context;
  const target = artifact.after.entries.filter((entry) => entry.classification === 'social'
    && entry.memory?.subjectAgentId === pair.subjectAgentId && entry.memory?.otherAgentId === pair.otherAgentId);
  const ids = Array.isArray(model?.sourceMemoryIds) ? model.sourceMemoryIds : [];
  if (model?.subjectAgentId !== pair.subjectAgentId || model?.otherAgentId !== pair.otherAgentId
      || !modelService.validateSocialMentalModel(model)) fail('SOCIAL_MODEL_INVALID', 'LLM model invalid or wrong agent pair.');
  validateMaskedModel(model, { ids, target, artifact, receipt });
  validatePresentModel(ids, target, artifact);
  return { target, ids };
}

function validateMaskedModel(model, context) {
  const { ids, target, artifact, receipt } = context;
  const masked = artifact.mode === 'mask-social-memories';
  if (!masked) return;
  const cited = model.unknowns.some((unknown) => unknown.includes(receipt.receiptId));
  const unknownHypothesis = model.relationHypotheses.some((hypothesis) => hypothesis.relationType === 'unknown');
  if (target.length || ids.length || !unknownHypothesis || !cited) {
    fail('SOCIAL_MODEL_MASKED_ABSENCE_INVALID', 'Masked model must cite verified absence and contain no source memories.');
  }
}

function validatePresentModel(ids, target, artifact) {
  if (artifact.mode === 'mask-social-memories') return;
  if (!target.length || digest([...ids].sort()) !== digest(target.map((entry) => entry.id).sort())) {
    fail('SOCIAL_MODEL_SOURCE_SET_INVALID', 'Model source IDs must exactly match intervention after-set.');
  }
}

async function persistVerifiedSocialMentalModel(db, input) {
  const scope = scopeOf(input);
  const pair = pairOf(input);
  const verified = await verifyPersistedSocialMemoryIntervention(db, { ...scope, interventionId: input.interventionId });
  const { artifact, receipt } = verified;
  const { target, ids } = validateModelSources(input.model, { pair, artifact, receipt });
  const intervention = artifact.mode === 'mask-social-memories' ? 'mask-social-memories' : artifact.mode;
  const snapshot = await store.persistSocialMentalModel(db, { ...scope, snapshotId: text(input.snapshotId, 'snapshotId'),
    subjectAgentId: pair.subjectAgentId, otherAgentId: pair.otherAgentId, revision: input.revision,
    model: input.model, sourceMemoryIds: ids, intervention });
  const readback = await store.getLatestSocialMentalModel(db, { ...scope, ...pair });
  if (!readback || readback.snapshotId !== snapshot.snapshotId || readback.modelHash !== snapshot.modelHash) {
    fail('SOCIAL_MODEL_READBACK_FAILED', 'Model snapshot failed persisted readback.');
  }
  return { snapshot: readback, sourceReadback: sourceReadback(target.map((entry) => entry.memory)),
    intervention: { artifact, receipt } };
}

async function createPersistedSocialMemoryIntervention(db, input) {
  return require('./socialMemoryInterventionRuntimeService').createPersistedSocialMemoryIntervention(db, input);
}

async function verifyPersistedSocialMemoryIntervention(db, input) {
  return require('./socialMemoryInterventionRuntimeService').verifyPersistedSocialMemoryIntervention(db, input);
}

module.exports = { ensureTables, recordVerifiedSocialMemory, loadVerifiedSocialMemories,
  buildPersistedSocialMentalModel, persistVerifiedSocialMentalModel,
  createPersistedSocialMemoryIntervention, verifyPersistedSocialMemoryIntervention, validateInvocationReceipts };
