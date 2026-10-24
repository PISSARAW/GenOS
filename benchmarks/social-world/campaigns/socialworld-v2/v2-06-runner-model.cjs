'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const REPO_ROOT=path.resolve(__dirname,'../../../..');
const TOKEN_BUDGET=1200;
const MAX_TURNS=2;
const MAX_TOKENS=700;
const PROVIDER_TIMEOUT_MS=180000;
const ACTIONS=['propose-collaboration','ask-for-update','wait-for-reconciliation'];
function readJson(filename) { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
function sessionPrompts(event, speaker, transcript) {
  const roleInstruction = speaker === 'subject' ? event.subjectTurn : event.peerTurn;
  return [
    'You are a participant in a bounded SocialWorld dialogue. Return JSON only, with one string field named utterance.',
    'Write only the next natural utterance for your assigned participant. Do not label the relationship, score polarity, or predict a later decision.',
    `Assigned event context: ${event.question}`,
    `Role-specific facts and task: ${roleInstruction}`,
    `Persisted dialogue so far: ${JSON.stringify(transcript)}`,
  ].join('\n\n');
}

function sourceModelPrompt(input) {
  const memoryView = input.memories.map((memory) => ({ id: memory.id, statement: memory.statement }));
  const absence = memoryView.length ? '' : `No social memories are visible in this arm; state the relation as unknown and cite no hidden memory IDs. Explicitly include this verified absence receipt ID in unknowns: ${input.absenceReceiptId}.`;
  return [
    'Infer a source-grounded social mental model from the supplied persisted dialogue observations.',
    'Return JSON only. Do not reveal hidden chain of thought. State concise hypotheses, uncertainty, beliefs about the other participant, and at least one alternative interpretation when evidence permits.',
    'Cite only supplied memory IDs. Do not infer relation labels or polarity scores from metadata; no such metadata is provided.',
    `Subject: ${input.subjectAgentId}; other participant: ${input.otherAgentId}.`,
    absence,
    `Visible dialogue memories: ${JSON.stringify(memoryView)}`,
    `Required model keys: schemaVersion=1, subjectAgentId, otherAgentId, relationHypotheses, beliefsAboutOther, unknowns, alternativeInterpretations, sourceMemoryIds, generatedAt, authority='descriptive-only', promotionEligible=false.`,
  ].filter(Boolean).join('\n\n');
}

function decisionPrompt(input) {
  const memoryView = input.memories.map((memory) => ({ id: memory.id, statement: memory.statement }));
  return [
    'Make one delayed, non-executing social decision proposal. Return JSON only with action and memoryReferences.',
    'Do not send a message, mutate state, change permissions, or claim an action was executed. Do not reveal hidden chain of thought.',
    `Allowed action values: ${ACTIONS.join(', ')}.`,
    `Persisted model from your first call: ${JSON.stringify(input.model)}.`,
    `Memories visible to this arm: ${JSON.stringify(memoryView)}.`,
    `New delayed context: ${input.delayedContext}`,
    `Permission constraints: ${JSON.stringify(input.permissionPolicy)}.`,
    'Cite only visible memory IDs in memoryReferences. If no social memory is visible, use an empty memoryReferences array.',
  ].join('\n\n');
}

function parseJsonResponse(response) {
  const text = String(response?.text || '').trim();
  if (!text || !text.startsWith('{') || !text.endsWith('}')) throw Object.assign(new Error('Model response was not a JSON object.'), { code: 'MODEL_RESPONSE_INVALID' });
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('Model response was not a JSON object.'), { code: 'MODEL_RESPONSE_INVALID' });
  return parsed;
}

async function generateJson(provider, input) {
  const response = await provider.generate({ model: input.model, prompt: input.prompt,
    seed: input.seed, temperature: input.temperature ?? 0.2, responseFormat: 'json_object', enforceSchema: true,
    stream: false, maxTokens: MAX_TOKENS, timeoutMs: PROVIDER_TIMEOUT_MS,
    priority: 'bulk', agentId: input.agentId, organizationId: input.organizationId, projectId: input.projectId });
  return { parsed: parseJsonResponse(response), response };
}

function turnReceipt({ response, utterance, sequence, prompt, durationMs }) {
  const digest = require('../../../../backend/src/services/biologicalIntegrity').digest;
  const invocationId = crypto.randomUUID();
  return { seq: sequence, provider: response.provider, servedModel: response.servedModel,
    invocationId,
    promptHash: digest(prompt), contentHash: digest(utterance), durationMs,
    provenanceSource: 'GenOS modelProvider local invocation' };
}

async function runDialogueEvent(input) {
  const verbal = require('../../../../backend/src/services/communication/verbalEscalationService');
  const dialogue = require('../../../../backend/src/services/communication/dialogueSessionService');
  const { db, provider, model, seedNumber, event, pair, scope } = input;
  const escalation = await verbal.requestEscalation({ db, trigger: 'COMMITMENT_NEGOTIATION',
    participants: [pair.subjectAgentId, pair.otherAgentId], unresolvedQuestion: event.question, domain: event.domain });
  const session = await dialogue.openDialogue({ db, escalationId: escalation.id,
    tokenBudget: TOKEN_BUDGET, maxTurns: MAX_TURNS, requiredArtifact: 'ExperimentProposal' });
  const turns = [];
  const modelTurnReceipts = [];
  const speakers = [pair.subjectAgentId, pair.otherAgentId];
  for (let index = 0; index < speakers.length; index += 1) {
    const speaker = speakers[index];
    const role = index === 0 ? 'subject' : 'peer';
    const prompt = sessionPrompts(event, role, turns); const requestStarted = Date.now();
    const generated = await generateJson(provider, { model, prompt,
      seed: seedNumber * 1000 + input.eventIndex * 10 + index, temperature: 0.2,
      agentId: speaker, organizationId: scope.organizationId, projectId: scope.projectId });
    const utterance = String(generated.parsed.utterance || '').trim();
    if (!utterance) throw Object.assign(new Error('Dialogue turn had no utterance.'), { code: 'MODEL_RESPONSE_INVALID' });
    await dialogue.appendTurn({ db, escalationId: session.id, speaker, utterance, tokensUsed: Number(generated.response.inputTokens || 0) + Number(generated.response.outputTokens || 0) });
    const receipt = turnReceipt({ response: generated.response, utterance, sequence: index + 1,
      prompt, durationMs: Date.now() - requestStarted });
    turns.push({ seq: index + 1, speaker, utterance });
    modelTurnReceipts.push(receipt);
  }
  const refs = turns.map((turn) => `dialogue:${session.id}:turn:${turn.seq}`);
  const socialObservation = { relationType: event.relationType, polarity: event.polarity,
    statement: event.statement, evidenceRefs: refs };
  const resolved = await dialogue.closeSession({ db, escalationId: session.id, artifactKind: 'ExperimentProposal',
    organizationId: scope.organizationId, projectId: scope.projectId,
    artifact: { summary: event.statement, evidenceRefs: refs, socialObservation, modelTurnReceipts } });
  return { session: resolved, socialObservation, modelTurnReceipts };
}

async function recordSourceMemories(db, input) {
  const runtime = require('../../../../backend/src/services/socialMentalModelRuntimeService');
  const source = [];
  for (const event of input.protocol.events) {
    const generated = await runDialogueEvent({ ...input, db, event,
      eventIndex: input.protocol.events.indexOf(event) });
    const memory = await runtime.recordVerifiedSocialMemory(db, { ...input.scope,
      ...input.pair, sessionId: generated.session.id });
    source.push({ eventKey: event.eventKey, ...memory });
  }
  return source;
}

function validateModelOutput({ model, input, visibleMemories, role }) {
  const validator = require('../../../../backend/src/services/socialMentalModelService').validateSocialMentalModel;
  if (!validator(model)) throw Object.assign(new Error('Model output did not satisfy the social mental model contract.'), { code: 'MODEL_OUTPUT_SCHEMA_INVALID' });
  const allowed = new Set(visibleMemories.map((memory) => memory.id));
  if (model.sourceMemoryIds.some((id) => !allowed.has(id))) throw Object.assign(new Error('Model cited a hidden or unknown memory id.'), { code: 'MODEL_MEMORY_REFERENCE_INVALID' });
  if (role === 'masked' && (model.sourceMemoryIds.length || !model.relationHypotheses.some((item) => item.relationType === 'unknown') || !model.unknowns.length)) {
    throw Object.assign(new Error('Masked arm must report unknown relation without hidden sources.'), { code: 'MASKED_MODEL_INVALID' });
  }
  if (role !== 'masked' && model.sourceMemoryIds.length < 1) throw Object.assign(new Error('Model did not cite visible memories.'), { code: 'MODEL_MEMORY_REFERENCE_INVALID' });
}

function roleForArm(arm) {
  return { 'genos-full': 'baseline', 'genos-social-memory-ablated': 'masked',
    'genos-social-memory-counterfactual': 'counterfactual' }[arm] || `comparison:${arm}`;
}

function promptMemories(memories) {
  return memories.map((memory) => ({ id: memory.id, statement: memory.statement }));
}

function counterfactuals(memories, protocol) {
  const replacement = new Map(protocol.events.map((event) => [event.eventKey, event.counterfactualStatement ||
    `Counterfactual intervention: the peer did not complete the event described by memory ${event.eventKey}.` ]));
  return memories.map((memory) => ({ ...memory,
    id: `counterfactual-${memory.id}`,
    statement: replacement.get(memory.eventKey) || `Counterfactual intervention: ${memory.statement}`,
    polarity: 'contradicts', counterfactualOf: memory.id }));
}



function runtimeVersion() {
  return readJson(path.join(REPO_ROOT, 'backend/package.json')).version || 'unknown';
}

function sourceCommit() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}


function modelStatusLine(status) {
  return JSON.stringify({ ready: status.configured && status.apiKeyConfigured,
    provider: status.provider, model: status.model });
}

function allocateWorkDirectory(value, seed, attempt) {
  if (!value || !path.isAbsolute(value)) throw new Error('--work-dir must be an absolute path outside the repository.');
  const resolved = path.resolve(value);
  const relative = path.relative(REPO_ROOT, resolved);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) throw new Error('--work-dir must be outside the repository.');
  fs.mkdirSync(resolved, { recursive: true });
  return path.join(resolved, `socialworld-v2-06-${seed}-attempt-${String(attempt).padStart(3, '0')}`);
}



module.exports={runtimeVersion,sourceCommit,modelStatusLine,allocateWorkDirectory,sessionPrompts,sourceModelPrompt,decisionPrompt,parseJsonResponse,generateJson,turnReceipt,runDialogueEvent,recordSourceMemories,validateModelOutput,roleForArm,promptMemories,counterfactuals};
