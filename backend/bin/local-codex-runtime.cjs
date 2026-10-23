#!/usr/bin/env node
console.log = (...args) => process.stderr.write(args.map(String).join(' ') + '\n');
console.info = (...args) => process.stderr.write(args.map(String).join(' ') + '\n');
const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');
const runtimeBudget = require('./runtime-budget-limit.cjs');
const { localArtifactInstruction } = require('../src/services/localArtifactInstruction');
const modelRouter = require('../src/services/modelRouter');
const localSynthesis = require('../src/services/localRuntimeSynthesis');
const captureBarrier = require('../src/services/localRuntimeCaptureBarrier');
const observationInbox = require('../src/services/localRuntimeObservationInbox');
const intraEpochInbox = require('../src/services/localRuntimeIntraEpochInbox');
const path = require('path');
let raw = Buffer.alloc(0);
if (require.main === module) {
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => {
  try {
    await main(raw);
  } catch (error) {
    console.error(`[local-codex-runtime] Mission bootstrap failed: ${error?.stack || error}`);
    process.exitCode = 1;
  }
});
process.stdin.on('error', (error) => {
  console.error(`[local-codex-runtime] Mission stdin failed: ${error.message}`);
  process.exitCode = 1;
});
}
async function main(rawInput) {
  let mission;
  try {
    mission = decodeMissionInput(rawInput);
  } catch (e) {
    process.exit(2);
  }
  mission.workerKind = mission.workerKind || mission.worker_kind;
  mission.workerContractJson = mission.workerContractJson || mission.worker_contract_json;
  mission.workerContract = parseJson(mission.workerContractJson);
  observationInbox.bind(mission.agentId);
  intraEpochInbox.bind(mission.agentId);
  const prompt = mission.prompt || mission.currentTask || 'No prompt provided';
  const workspaceRoot = path.resolve(mission.workspaceRoot || process.cwd());
  const built = require('./localRuntimeWorkspaceContext.cjs').buildWorkspaceContext(workspaceRoot);
  const contextStr = built.text;
  const agentIdentity = require('../src/services/agentIdentityService');
  const agentConscience = require('../src/services/agentConscienceService');
  const identity = resolveAgentIdentity(mission, agentIdentity);
  const conscienceBlock = await loadConscienceBlock(mission, agentConscience);
  const unified = await require('../src/services/agentSelfBlocks').loadUnifiedSelfBlocks(null, mission.agentId, { wantWorker: mission.executionMode === 'worker' });
  const strategyExecutionAdapter = require('../src/services/strategyExecutionAdapter');
  const agentMemory = require('../src/services/agentMemoryContext');
  const state = {
    mission, prompt, contextStr, workspaceRoot, fileHashes: built.fileHashes,
    agentName: identity.agentName, nameMeaning: identity.nameMeaning, selfIntro: identity.selfIntro,
    conscienceBlock, strategyContract: parseJson(mission.strategyContractJson),
    autonomyPlan: parseJson(mission.autonomyPlanJson), executionPolicy: parseJson(mission.executionPolicyJson),
    executionBudget: parseJson(mission.executionBudgetJson), localRoutingPolicy: parseJson(mission.localRoutingPolicyJson),
    allowFileEdits: false, promptTokenEstimate: Math.ceil(Buffer.byteLength(String(prompt), 'utf8') / 4),
    eventCount: 0, primaryStrategy: '', strategyContext: '', memoryBlock: '',
    agentSelfBlock: '', workerSelfBlock: '', framedPrompt: '', commandProofs: []
  };
  Object.assign(state, unified);
  state.allowFileEdits = state.executionPolicy.allowFileEdits === true;
  state.primaryStrategy = state.strategyContract.selected_strategy?.primary || 'deterministic_direct_path';
  const services = { strategyExecutionAdapter, agentMemory };
  await buildPromptContext(state, services);
  state.baseFramedPrompt = state.framedPrompt;
  state.resumeCheckpoint = await require('../src/services/localRuntimeCheckpoint').load(state);
  const reconnectLifecycle = require('../src/services/localRuntimeReconnectLifecycle');
  try {
    reconnectLifecycle.configure(state);
    captureBarrier.bind(state);
    state.reconnectRuntime = await reconnectLifecycle.start(state);
  } catch (error) {
    state.reconnectRuntime = null;
    console.error(`[local-codex-runtime] Reconnect disabled: ${error.message}`);
  }
  await runMission(state, services);
}
async function runMission(state, services) {
  const checkpoint = require('../src/services/localRuntimeCheckpoint');
  emitEvent(state, { eventType: 'AGENT_PLAN_CREATED', action: 'PLAN',
    detail: 'Local cognitive router runtime accepted the mission.', status: 'running', currentTask: state.prompt });
  guardBudget(state);
  try {
    let reply = state.resumeCheckpoint?.reply || null;
    const generate = () => require('../src/services/localRuntimeObservedGeneration').generate(state, {
      checkpoint, synthesis: localSynthesis, createGeneration, awaitGeneration, validateGeneration, emitEvent });
    if (!state.resumeCheckpoint) await checkpoint.save(state, 'prepared');
    if (!reply) await captureBarrier.safePoint(state.resumeCheckpoint?.phase || 'prepared');
    if (!reply) {
      reply = await generate();
      await checkpoint.save(state, 'generated', reply);
      await captureBarrier.safePoint('generated');
    }
    reply = await refreshObservedReply(state, reply, { generate, checkpoint });
    applyWorkerArtifacts(reply, state.workspaceRoot, state.allowFileEdits);
    await require('../src/services/runtimeFileWriteIpc').flush();
    state.commandProofs = await collectCommandProofs(reply, state.workspaceRoot, state.executionPolicy);
    const testReceipt = require('../src/services/codeTestExecutionReceipt').buildReceipt({
      agentId: state.mission.agentId, missionId: state.mission.missionId,
      workspaceRoot: state.workspaceRoot, proofs: state.commandProofs
    });
    if (testReceipt) emitEvent(state, testReceipt);
    if (state.resumeCheckpoint?.phase !== 'evaluated') {
      await checkpoint.save(state, 'evaluating', reply);
      await runPostPipeline(services, state, reply);
      await checkpoint.save(state, 'evaluated', reply);
      await captureBarrier.safePoint('evaluated');
    } else await captureBarrier.safePoint('evaluated');
    emitCompletion(state, reply);
    await checkpoint.save(state, 'completed', reply);
    await require('../src/services/subprocessModelBudgetRoute').close(state.modelBudgetRoute);
    await require('../src/services/localRuntimeReconnectLifecycle').close(state);
    process.exit(0);
  } catch (e) {
    await require('../src/services/runtimeFileWriteIpc').flush().catch(() => {});
    emitFailure(state, e);
    await require('../src/services/subprocessModelBudgetRoute').close(state.modelBudgetRoute);
    await require('../src/services/localRuntimeReconnectLifecycle').close(state);
    process.exit(1);
  }
}
async function refreshObservedReply(state, reply, services) {
  const observationCurrent = observationInbox.currentRevision() <= (state.observationRevision || 0);
  const attentionCurrent = intraEpochInbox.currentRevision() <= (state.intraEpochRevision || 0);
  if (observationCurrent && attentionCurrent) return reply;
  const refreshed = await services.generate();
  await services.checkpoint.save(state, 'generated', refreshed);
  return refreshed;
}
function guardBudget(state) {
  if (state.promptTokenEstimate < budgetLimit(state.executionBudget, 'tokens')) return;
  emitEvent(state, { eventType: 'AGENT_HALTED', action: 'BUDGET_GUARD',
    detail: `Prompt consumes the local token budget (${state.promptTokenEstimate} >= ${budgetLimit(state.executionBudget, 'tokens')}).`, severity: 'warning', status: 'blocked' });
  process.exit(1);
}
async function createGeneration(state) {
  state.modelBudgetRoute ||= await require('../src/services/subprocessModelBudgetRoute').openForMission(state.mission, state.executionBudget);
  const { withTextImmunity } = require('../src/services/immuneSystem.js');
  const griotValidator = (text) => {
    if (text.length < 10) throw new Error('Réponse trop courte ou absente.');
    localSynthesis.validateSynthesisReply(text, state.autonomyPlan);
    localSynthesis.validateWorkerReply(text, state);
  };
  const fallback = { used: false, message: `### Synthèse Cognitive Locale (${state.agentName})\nMission: ${state.prompt}\n- Statut: Analyse cognitive locale exécutée.\n- Recommandation: Exécution des primitives stratégiques et persistance synaptique terminées.` };
  const abort = new AbortController();
  const overrideTimeoutMs = Number(process.env.GENOS_LOCAL_MODEL_TIMEOUT_MS) || 0;
  const latencyBudgetMs = budgetLimit(state.executionBudget, 'latencyMs');
  const perAttemptTimeoutMs = overrideTimeoutMs > 0 ? overrideTimeoutMs : (Number.isFinite(latencyBudgetMs) ? Math.max(120000, Math.floor(latencyBudgetMs * 0.75)) : 300000);
  const workerFormat = state.mission.executionMode === 'worker' ? require('../src/services/agents/workerArtifactResponseSchema').workerArtifactResponseFormat(state.mission.workerKind || state.mission.role) : undefined;
  const generation = withTextImmunity(state.framedPrompt, 'high', { validatorFn: griotValidator, maxRetries: 3, agentId: state.agentName,
    modelRouting: { ...state.modelBudgetRoute, agentId: state.mission.agentId, missionId: state.mission.missionId, maxTokens: Math.max(0, budgetLimit(state.executionBudget, 'tokens') - state.promptTokenEstimate), model: state.mission.localModel || undefined, variantIndex: state.mission.variantIndex, policy: state.localRoutingPolicy, signal: abort.signal, timeoutMs: perAttemptTimeoutMs, responseFormat: workerFormat, enforceSchema: false,
      onResult: result => { state.observedRoute = require('../src/services/localCompletionEvidence').observedRoute(result); } },
    stemCellFallback: fallback.message, onFallback: () => { fallback.used = true; } });
  return { generation, abort, fallback };
}
async function awaitGeneration(state, generation, abort) {
  const timeoutMs = budgetLimit(state.executionBudget, 'latencyMs');
  const timeout = latencyGuard(timeoutMs, abort);
  return Promise.race(timeout ? [generation, timeout] : [generation]);
}
function latencyGuard(timeoutMs, abort) {
  if (!Number.isFinite(timeoutMs)) return null;
  return new Promise((_, reject) => {
    const timer = setTimeout(() => { abort.abort(); reject(new Error(`Local generation exceeded latency budget (${timeoutMs}ms).`)); }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
}
function validateGeneration(reply, fallback, state) {
  if (!reply) throw new Error('Échec critique de la génération (Apoptose).');
  if (fallback.used) throw new Error(`Local model generation failed after retries. Fallback diagnostic: ${fallback.message}`);
  const observedTokens = state.promptTokenEstimate + Math.ceil(Buffer.byteLength(String(reply), 'utf8') / 4);
  if (observedTokens > budgetLimit(state.executionBudget, 'tokens')) throw new Error(`Local generation exceeded token budget (${observedTokens} > ${budgetLimit(state.executionBudget, 'tokens')}).`);
  if (state.eventCount + 1 > budgetLimit(state.executionBudget, 'events')) throw new Error(`Local runtime exceeded event budget (${state.eventCount + 1} > ${budgetLimit(state.executionBudget, 'events')}).`);
}
async function runPostPipeline(services, state, reply) {
  try {
    const turn = (step, action, detail) => ({ step, action, classification: 'Breakthrough', success: true, detail: String(detail).slice(0, 200) });
    await services.strategyExecutionAdapter.executePipelineWithFeedback(['evaluate', 'stdp_update', 'cherry_pick_golden_path'], {
      agentId: state.mission.agentId || state.agentName, orchestratorId: state.mission.orchestratorAgentId || state.mission.agentId || state.agentName,
      workspaceId: state.mission.workspaceId || 'ws-genos-core', task: state.prompt, reply,
      turns: [turn(1, 'cognitive_routing', state.prompt), turn(2, 'runtime_execution', reply)] });
    await services.agentMemory.compileExecutionMemory(state.agentName, state.prompt, reply, { outcome: 'success', missionScope: state.mission.missionScope });
  } catch (e) {
    if (state.mission.runtimeCheckpointEnabled) throw e;
  }
}
function emitCompletion(state, reply) {
  const { buildDossierArtifact, buildWorkerArtifact } = require('../src/services/agents/workerArtifactContract');
  const workerKinds = require('../src/services/agents/workerKindService');
  const modelRef = String(state.mission.localModel || process.env.GENOS_LOCAL_MODEL || process.env.OLLAMA_MODEL || 'local-model');
  const provenance = { source: 'local-codex-runtime', model: modelRef, workspaceRoot: state.workspaceRoot, agentName: state.agentName, methodContract: state.mission.methodContract || null, readFileHashes: state.fileHashes };
  const kind = workerKinds.resolveWorkerKind(state.mission.workerKind, state.mission.role);
  const dossierText = augmentReplyWithProofs(reply, state.commandProofs);
  const workerArtifact = state.mission.executionMode === 'worker' ? buildWorkerArtifact(kind, dossierText, provenance) : buildDossierArtifact(dossierText, provenance);
  if (!workerArtifact) throw new Error(`Local model did not return a valid '${workerKinds.kindDefinition(kind).artifact}' artifact.`);
  const parsedReply = localSynthesis.parseCompletionReply(dossierText);
  const report = { outcome: 'success', claims: localSynthesis.reportClaims(parsedReply, dossierText, state),
    workerArtifact, author: { name: state.agentName, meaning: state.nameMeaning, role: state.mission.role || 'Assistant IA de développement' } };
  attachProofTests(report, state.commandProofs);
  localSynthesis.attachInfluence(report, parsedReply);
  require('../src/services/localCompletionEvidence').attachFields(report, parsedReply);
  emitEvent(state, { eventType: 'EVIDENCE_REPORT', action: 'VERIFY_CLAIMS', detail: 'Local runtime emitted its structured evidence report.', payload: report });
  emitEvent(state, { eventType: 'AGENT_COMPLETED', action: 'COMPLETE', detail: 'Local cognitive router completed with Epigenetic Canalization.', status: 'completed', payload: state.observedRoute || {} });
}
function attachProofTests(report, proofs) {
  const executed = (proofs || []).filter((proof) => proof && proof.executed);
  if (executed.length) report.tests = executed.map((proof) => ({ command: proof.command, exitCode: proof.exitCode, stdout: proof.stdout, stderr: proof.stderr }));
}
function emitFailure(state, e) {
  const budgetBlocked = /budget|latency/i.test(e.message);
  emitEvent(state, { eventType: budgetBlocked ? 'AGENT_HALTED' : 'AGENT_FAILED', action: budgetBlocked ? 'BUDGET_GUARD' : 'ERROR',
    detail: e.message, severity: budgetBlocked ? 'warning' : 'error', status: budgetBlocked ? 'blocked' : 'error' });
}
async function buildPromptContext(state, services) {
  await buildStrategyContext(services.strategyExecutionAdapter, state);
  state.memoryBlock = await loadMemoryBlock(services.agentMemory, state);
  state.framedPrompt = buildFramedPrompt(state);
}
async function buildStrategyContext(adapter, state) {
  try {
    const memOutcome = await adapter.executePipelineWithFeedback(['search_memory', 'compile_memory', 'search_failures'], { agentId: state.mission.agentId || state.agentName, orchestratorId: state.mission.orchestratorAgentId || state.mission.agentId || state.agentName, task: state.prompt, missionScope: state.mission.missionScope });
    if (memOutcome?.results?.length) state.strategyContext = `[STRATÉGIE GENOS ACTIVE : ${state.primaryStrategy}]\nPrimitives exécutées : ` + memOutcome.results.map((r) => `${r.primitive} (${r.result?.success ? 'OK' : 'FAIL'})`).join(', ') + '\n\n';
  } catch (e) {}
}
async function loadMemoryBlock(agentMemory, state) {
  try {
    return await agentMemory.formatCognitiveMemoryPrompt(state.agentName, state.prompt, { missionScope: state.mission.missionScope });
  } catch (e) { return ''; }
}
function buildFramedPrompt(state) {
  if (state.mission.executionMode !== 'worker') return buildUncontractedPrompt(state);
  const workerKinds = require('../src/services/agents/workerKindService');
  const kind = workerKinds.resolveWorkerKind(state.mission.workerKind, state.mission.role);
  const contract = state.mission.workerContract || workerKinds.buildWorkerContract(kind, { prompt: state.prompt, scope: state.workspaceRoot, orchestratorAgentId: state.mission.orchestratorAgentId });
  const evidenceRule = workerKinds.evidenceRule(contract);
  const instruction = evidenceRule ? `CONTRAT DE PREUVE OBLIGATOIRE : ${evidenceRule}\nLe format demandé dans la mission concerne la réponse finale de l'orchestrateur. En tant que worker, rends uniquement l'artefact JSON de ton contrat, avec ses champs et références de source.\n\n` : '';
  return buildUncontractedPrompt(state, instruction);
}
function buildUncontractedPrompt(state, evidenceInstruction = '') {
  return `${state.selfIntro} Tu disposes uniquement des informations présentes dans cette requête et dans le contexte ci-dessous. Le contexte inclut le CONTENU des fichiers du workspace injecté par le runtime, chaque extrait accompagné de son sha256 : cite ce hash pour toute lecture utilisée et n'invente aucune lecture. Le runtime ne consulte pas Internet.
Tes blocs [ARTIFACT: chemin]...[/ARTIFACT] sont appliqués STRICTEMENT dans la capsule du worker. Une commande de test n'est exécutée via la sandbox que si elle figure dans allowed_commands et dans l'allowlist (preuve exit_code/stdout/stderr jointe au dossier). Tout fichier dépassant le plafond est signalé par un refus explicite et son hash, sans contenu.
Si une source nécessaire manque, signale précisément cette limite. N'invente ni citation ni résultat de vérification. Ne déclare jamais « corrigé » ni « tests réussis » sans diff appliquée ni sortie de commande prouvée.
${state.conscienceBlock}
${state.agentSelfBlock || ''}
${state.workerSelfBlock || ''}
${state.memoryBlock}${state.strategyContext}${localArtifactInstruction(state.allowFileEdits)}
PLANS D'ACTION: Lorsque tu proposes un plan d'action, tu dois SYSTÉMATIQUEMENT utiliser des listes de tâches Markdown (\`- [ ]\`).
${state.contextStr}Requête de l'utilisateur : ${state.prompt}\n\n${evidenceInstruction}`;
}
function resolveAgentIdentity(mission, agentIdentity) {
  if (mission.name && mission.name !== 'Worker') {
    const meaning = mission.nameMeaning || (agentIdentity.findIdentityByName(mission.name)?.meaning || 'Assistant cognitif de GenOS');
    return { agentName: mission.name, nameMeaning: meaning, selfIntro: agentIdentity.formatSelfIntroduction(mission.name, meaning, mission.role) };
  }
  const generated = agentIdentity.generateAgentIdentity({ role: mission.role });
  return { agentName: generated.name, nameMeaning: generated.name_meaning, selfIntro: generated.introduction };
}
async function loadConscienceBlock(mission, agentConscience) {
  const helper = require('../src/services/agentSelfBlocks');
  return helper.loadConscienceText(null, mission.agentId, agentConscience);
}
function applyWorkerArtifacts(reply, workspaceRoot, allowFileEdits) {
  if (!allowFileEdits) return [];
  const found = [...String(reply).matchAll(/\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/gi)];
  const result = require('../src/services/localArtifactWriter').writeArtifacts(reply, { workspaceRoot, allowFileEdits });
  if (result.rejected.length) {
    const details = result.rejected.map(item => `${item.name}: ${item.issues.join(', ')}`).join('; ');
    throw new Error(`Worker artifact rejected: ${details}`);
  }
  return found.map((match) => match[1].trim());
}
function requestedTestCommands(reply) {
  return testListOf(parseReplyObject(reply)?.tests);
}
function testListOf(tests) {
  if (!Array.isArray(tests)) return [];
  return tests.filter((item) => typeof item === 'string' && item.trim()).slice(0, 4);
}
function parseReplyObject(reply) {
  if (reply && typeof reply === 'object' && !Array.isArray(reply)) return reply;
  const text = String(reply || '');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const parsed = parseJson(fenced ? fenced[1] : text);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}
async function collectCommandProofs(reply, workspaceRoot, executionPolicy) {
  const allowed = Array.isArray(executionPolicy?.allowedCommands) ? executionPolicy.allowedCommands : [];
  const proofs = [];
  for (const command of requestedTestCommands(reply)) proofs.push(await runAllowedCommand(workspaceRoot, command, allowed));
  return proofs;
}
async function runAllowedCommand(workspaceRoot, command, allowedCommands) {
  const policy = require('../src/services/sandboxCommandPolicy');
  const values = require('../src/services/trinityProvenanceValues');
  const normalized = policy.normalizeSandboxCommand(command);
  if (!(allowedCommands || []).includes(normalized)) return { command: normalized, executed: false, reason: 'not_in_allowed_commands' };
  if (!policy.isAllowedSandboxTestCommand(normalized)) return { command: normalized, executed: false, reason: 'not_allowlisted' };
  try {
    const result = await require('../src/services/sandboxExecutor').runIsolated({ command: normalized, cwd: workspaceRoot, timeoutMs: 60000 });
    const proof = { command: normalized, executed: true, exitCode: result.exitCode, stdout: String(result.stdout || '').slice(0, 4000), stderr: String(result.stderr || '').slice(0, 4000) };
    proof.digest = values.digest({ command: proof.command, exitCode: proof.exitCode, stdout: proof.stdout, stderr: proof.stderr });
    return proof;
  } catch (error) {
    return { command: normalized, executed: false, reason: 'executor_refused' };
  }
}
function augmentReplyWithProofs(reply, proofs) {
  const executed = (proofs || []).filter((proof) => proof && proof.executed);
  if (!executed.length) return reply;
  const parsed = parseReplyObject(reply);
  if (!parsed) return reply;
  const refs = executed.map((proof) => `genos://code-test/${proof.digest}`);
  if (Array.isArray(parsed.claims)) for (const claim of parsed.claims) {
    if (claim && typeof claim === 'object') claim.evidence = [...(Array.isArray(claim.evidence) ? claim.evidence : []), ...refs];
  }
  parsed.tests = executed.map((proof) => ({ command: proof.command, exitCode: proof.exitCode, stdout: proof.stdout, stderr: proof.stderr }));
  return JSON.stringify(parsed);
}
function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (e) {
    return {};
  }
}
function budgetLimit(executionBudget, key) {
  return runtimeBudget.budgetLimit(executionBudget, key);
}
function emitEvent(state, event) {
  state.eventCount += 1;
  state.reconnectRuntime?.supervision?.publish('event', {
    name: String(event.eventType || 'runtime-event').slice(0, 128), detail: event
  });
  const terminal = { AGENT_COMPLETED: 'completed', AGENT_FAILED: 'failed',
    AGENT_HALTED: 'cancelled' }[event.eventType];
  if (terminal) state.reconnectRuntime?.supervision?.publish('terminal', {
    state: terminal, detail: { eventType: event.eventType }
  });
  process.stdout.write(encodeEvent(event));
}
module.exports = { ...require('./localRuntimeWorkspaceContext.cjs'), applyWorkerArtifacts, requestedTestCommands, collectCommandProofs, augmentReplyWithProofs };
