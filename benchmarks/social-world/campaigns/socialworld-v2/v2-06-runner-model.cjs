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

function sourceExtractionPrompt(input) {
  return [
    'Classify the peer response to the exact yes/no question using only the persisted dialogue turns.',
    'Return JSON only with answer (yes, no, or unclear) and evidenceQuote (an exact substring from the peer utterance).',
    'Do not use the protocol event label, expected polarity, or facts outside the dialogue.',
    `Question: ${input.question}`,
    `Persisted turns: ${JSON.stringify(input.turns)}`,
    'If the peer response does not clearly answer the question, use answer="unclear" and quote the closest relevant substring or an empty string.',
  ].join('\n\n');
}

function validateSocialExtraction(extraction, peerUtterance) {
  const validAnswer = ['yes', 'no', 'unclear'].includes(extraction?.answer);
  const quote = extraction?.evidenceQuote;
  if (!validAnswer || typeof quote !== 'string' || (quote && !peerUtterance.includes(quote))) {
    throw Object.assign(new Error('Dialogue extraction did not cite an exact peer-turn substring.'), { code: 'SOCIAL_DIALOGUE_EXTRACTION_INVALID' });
  }
  if (extraction.answer === 'unclear' || !quote) {
    throw Object.assign(new Error('Peer dialogue did not answer the registered source question clearly.'), { code: 'SOCIAL_DIALOGUE_OUTCOME_UNCLEAR' });
  }
  return { answer: extraction.answer, evidenceQuote: quote };
}

function polarityFromAnswer(answer, polarityWhenAnswerYes) {
  if (!['supports', 'contradicts'].includes(polarityWhenAnswerYes)) {
    throw Object.assign(new Error('Protocol must declare the evidence polarity for a yes answer.'), { code: 'SOCIAL_DIALOGUE_POLARITY_MAP_INVALID' });
  }
  return answer === 'yes' ? polarityWhenAnswerYes : polarityWhenAnswerYes === 'supports' ? 'contradicts' : 'supports';
}

async function extractSocialObservation(input) {
  const prompt = sourceExtractionPrompt({ question: input.event.question, turns: input.turns });
  const generated = await generateJson(input.provider, { ...input.providerInput, seed: input.seed, prompt });
  const peerTurn = input.turns.find((turn) => turn.speaker === input.peerAgentId);
  const extraction = validateSocialExtraction(generated.parsed, peerTurn?.utterance || '');
  const receipt = { invocationId: crypto.randomUUID(), promptHash: require('../../../../backend/src/services/biologicalIntegrity').digest(prompt),
    outputHash: require('../../../../backend/src/services/biologicalIntegrity').digest(extraction), provider: generated.response.provider,
    servedModel: generated.response.servedModel, provenance: 'genos-modelProvider-local-invocation',
    provenanceSource: 'GenOS modelProvider local invocation' };
  return { relationType: input.event.relationType,
    polarity: polarityFromAnswer(extraction.answer, input.event.polarityWhenAnswerYes), statement: extraction.evidenceQuote,
    polarityWhenAnswerYes: input.event.polarityWhenAnswerYes,
    evidenceRefs: input.evidenceRefs, socialExtraction: { ...extraction, receipt } };
}

function sourceModelPrompt(input) {
  const memoryView = input.memories.map((memory) => ({ id: memory.id, statement: memory.statement }));
  const sourceIds = memoryView.map((memory) => memory.id);
  const shape = memoryView.length ? populatedModelExample(input, sourceIds) : emptyModelExample(input);
  const absence = memoryView.length ? '' : `No social memories are visible in this arm; state the relation as unknown and cite no hidden memory IDs. Explicitly include this verified absence receipt ID in unknowns: ${input.absenceReceiptId}.`;
  return [
    'Infer a source-grounded social mental model from the supplied persisted dialogue observations.',
    'Return JSON only. Do not reveal hidden chain of thought. State concise hypotheses, uncertainty, beliefs about the other participant, and at least one alternative interpretation when evidence permits.',
    'Cite only supplied memory IDs. In top-level sourceMemoryIds, include every visible memory ID exactly once. Do not infer relation labels or polarity scores from metadata; no such metadata is provided.',
    `Copy this exact list into top-level sourceMemoryIds: ${JSON.stringify(sourceIds)}.`,
    `Subject: ${input.subjectAgentId}; other participant: ${input.otherAgentId}.`,
    absence,
    `Visible dialogue memories: ${JSON.stringify(memoryView)}`,
    'Return this exact JSON shape. relationHypotheses items require relationType, confidence, supportingMemoryIds, contradictingMemoryIds. beliefsAboutOther items require proposition, confidence, sourceMemoryIds. unknowns and alternativeInterpretations are arrays of strings. Use ISO 8601 for generatedAt. Do not add keys.',
    `JSON shape: ${JSON.stringify(shape)}`,
    memoryView.length ? '' : `No memories are visible. Return the exact empty-evidence shape above, preserving all empty arrays and including receipt ${input.absenceReceiptId} in unknowns.`,
  ].filter(Boolean).join('\n\n');
}

function populatedModelExample(input, sourceIds) {
  return { schemaVersion: 1, subjectAgentId: input.subjectAgentId, otherAgentId: input.otherAgentId,
    relationHypotheses: [{ relationType: 'inferred relation', confidence: 0.5,
      supportingMemoryIds: ['visible memory ID'], contradictingMemoryIds: [] }],
    beliefsAboutOther: [{ proposition: 'grounded belief about the other participant', confidence: 0.5,
      sourceMemoryIds: ['visible memory ID'] }], unknowns: ['uncertain fact'],
    alternativeInterpretations: ['plausible alternative'], sourceMemoryIds: sourceIds,
    generatedAt: new Date().toISOString(), authority: 'descriptive-only', promotionEligible: false };
}

function emptyModelExample(input) {
  return { schemaVersion: 1, subjectAgentId: input.subjectAgentId, otherAgentId: input.otherAgentId,
    relationHypotheses: [{ relationType: 'unknown', confidence: 0,
      supportingMemoryIds: [], contradictingMemoryIds: [] }], beliefsAboutOther: [],
    unknowns: [input.absenceReceiptId], alternativeInterpretations: ['No social evidence is available.'],
    sourceMemoryIds: [], generatedAt: new Date().toISOString(), authority: 'descriptive-only', promotionEligible: false };
}

function decisionPrompt(input) {
  return [
    'Make one delayed, non-executing social decision proposal using only the supplied social model. Return JSON only with action and memoryReferences.',
    'Do not send a message, mutate state, change permissions, or claim an action was executed. Do not reveal hidden chain of thought.',
    `Allowed action values: ${ACTIONS.join(', ')}.`,
    `Persisted social model read back from the runtime: ${JSON.stringify(input.model)}.`,
    input.decisionPolicy ? `Apply this pre-registered evidence-to-action policy: ${JSON.stringify(input.decisionPolicy)}. Count unique IDs in relationHypotheses.supportingMemoryIds and relationHypotheses.contradictingMemoryIds; do not count an ID in both groups.` : '',
    'Do not reconstruct or cite source memories that are absent from this model. Use only the model’s stated beliefs, unknowns, alternatives, and source IDs.',
    `New delayed context: ${input.delayedContext}`,
    `Permission constraints: ${JSON.stringify(input.permissionPolicy)}.`,
    'Cite only source IDs listed by the supplied model in memoryReferences. If the model has no source IDs, use an empty memoryReferences array.',
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
  const socialObservation = input.protocol.independentDialogueExtraction
    ? await extractSocialObservation({ event, turns, provider, peerAgentId: pair.otherAgentId,
      providerInput: { model, agentId: pair.subjectAgentId, organizationId: scope.organizationId, projectId: scope.projectId,
        temperature: 0.2 }, seed: seedNumber * 1000 + input.eventIndex * 10 + 2, evidenceRefs: refs })
    : { relationType: event.relationType, polarity: event.polarity, statement: event.statement, evidenceRefs: refs };
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

function counterfactuals(memories, protocol, eventKeyByMemoryId) {
  const events = new Map(protocol.events.map((event) => [event.eventKey, event]));
  return memories.map((memory) => {
    const eventKey = eventKeyByMemoryId?.get(memory.id);
    const event = events.get(eventKey);
    if (!event?.counterfactualStatement) throw Object.assign(new Error('Counterfactual source event or statement missing.'), { code: 'SOCIAL_COUNTERFACTUAL_SOURCE_EVENT_MISSING' });
    return { ...memory, id: `counterfactual-${memory.id}`, eventKey,
      statement: event.counterfactualStatement,
      polarity: memory.polarity === 'supports' ? 'contradicts' : 'supports', counterfactualOf: memory.id };
  });
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



module.exports={runtimeVersion,sourceCommit,modelStatusLine,allocateWorkDirectory,sessionPrompts,sourceExtractionPrompt,validateSocialExtraction,polarityFromAnswer,extractSocialObservation,sourceModelPrompt,decisionPrompt,parseJsonResponse,generateJson,turnReceipt,runDialogueEvent,recordSourceMemories,validateModelOutput,roleForArm,promptMemories,counterfactuals};
