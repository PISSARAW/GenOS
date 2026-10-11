#!/usr/bin/env node
console.log = (...args) => process.stderr.write(args.map(String).join(' ') + '\n');
console.info = (...args) => process.stderr.write(args.map(String).join(' ') + '\n');

const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');
const { localArtifactInstruction } = require('../src/services/localArtifactInstruction');
const modelRouter = require('../src/services/modelRouter');
const localSynthesis = require('../src/services/localRuntimeSynthesis');
const captureBarrier = require('../src/services/localRuntimeCaptureBarrier');
const observationInbox = require('../src/services/localRuntimeObservationInbox');
const path = require('path');
let raw = Buffer.alloc(0);
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

  const prompt = mission.prompt || mission.currentTask || 'No prompt provided';
  const contextStr = buildWorkspaceContext();

  const agentIdentity = require('../src/services/agentIdentityService');
  const agentConscience = require('../src/services/agentConscienceService');
  const identity = resolveAgentIdentity(mission, agentIdentity);
  const conscienceBlock = await loadConscienceBlock(mission, agentConscience);
  const unified = await require('../src/services/agentSelfBlocks').loadUnifiedSelfBlocks(null, mission.agentId, { wantWorker: mission.executionMode === 'worker' });

  const strategyExecutionAdapter = require('../src/services/strategyExecutionAdapter');
  const agentMemory = require('../src/services/agentMemoryContext');

  const state = {
    mission,
    prompt,
    contextStr,
    agentName: identity.agentName,
    nameMeaning: identity.nameMeaning,
    selfIntro: identity.selfIntro,
    conscienceBlock,
    strategyContract: parseJson(mission.strategyContractJson),
    autonomyPlan: parseJson(mission.autonomyPlanJson),
    executionPolicy: parseJson(mission.executionPolicyJson),
    executionBudget: parseJson(mission.executionBudgetJson),
    localRoutingPolicy: parseJson(mission.localRoutingPolicyJson),
    workspaceRoot: path.resolve(mission.workspaceRoot || process.cwd()),
    allowFileEdits: false,
    promptTokenEstimate: Math.ceil(Buffer.byteLength(String(prompt), 'utf8') / 4),
    eventCount: 0,
    primaryStrategy: '',
    strategyContext: '',
    memoryBlock: '', agentSelfBlock: '', workerSelfBlock: '',
    framedPrompt: ''
  };
  Object.assign(state, unified);
  state.allowFileEdits = state.executionPolicy.allowFileEdits === true;
  state.primaryStrategy = state.strategyContract.selected_strategy?.primary || 'deterministic_direct_path';

  const services = { strategyExecutionAdapter, agentMemory };
  await buildPromptContext(state, services);
  state.baseFramedPrompt = state.framedPrompt;
  state.resumeCheckpoint = await require('../src/services/localRuntimeCheckpoint').load(state);
  await runMission(state, services);
}

async function runMission(state, services) {
  const checkpoint = require('../src/services/localRuntimeCheckpoint');
  emitEvent(state, {
    eventType: 'AGENT_PLAN_CREATED',
    action: 'PLAN',
    detail: 'Local cognitive router runtime accepted the mission.',
    status: 'running',
    currentTask: state.prompt
  });
  guardBudget(state);
  try {
    let reply = state.resumeCheckpoint?.reply || null;
    const generate = () => require('../src/services/localRuntimeObservedGeneration').generate(state, {
      checkpoint, synthesis: localSynthesis, createGeneration, awaitGeneration,
      validateGeneration, emitEvent
    });
    if (!state.resumeCheckpoint) await checkpoint.save(state, 'prepared');
    if (!reply) await captureBarrier.safePoint(state.resumeCheckpoint?.phase || 'prepared');
    if (!reply) {
      reply = await generate();
      await checkpoint.save(state, 'generated', reply);
      await captureBarrier.safePoint('generated');
    }
    if (observationInbox.currentRevision() > (state.observationRevision || 0)) {
      reply = await generate();
      await checkpoint.save(state, 'generated', reply);
    }
    require('../src/services/localArtifactWriter').writeArtifacts(reply, state);
    if (state.resumeCheckpoint?.phase !== 'evaluated') {
      await checkpoint.save(state, 'evaluating', reply);
      await runPostPipeline(services, state, reply);
      await checkpoint.save(state, 'evaluated', reply);
      await captureBarrier.safePoint('evaluated');
    } else await captureBarrier.safePoint('evaluated');
    emitCompletion(state, reply);
    await checkpoint.save(state, 'completed', reply);
    process.exit(0);
  } catch (e) {
    emitFailure(state, e);
    process.exit(1);
  }
}

function guardBudget(state) {
  if (state.promptTokenEstimate < budgetLimit(state.executionBudget, 'tokens')) return;
  emitEvent(state, {
    eventType: 'AGENT_HALTED',
    action: 'BUDGET_GUARD',
    detail: `Prompt consumes the local token budget (${state.promptTokenEstimate} >= ${budgetLimit(state.executionBudget, 'tokens')}).`,
    severity: 'warning',
    status: 'blocked'
  });
  process.exit(1);
}

function createGeneration(state) {
  const { withTextImmunity } = require('../src/services/immuneSystem.js');
  const griotValidator = (text) => {
    if (text.length < 10) throw new Error('Réponse trop courte ou absente.');
    localSynthesis.validateSynthesisReply(text, state.autonomyPlan);
    localSynthesis.validateWorkerReply(text, state);
  };
  const fallback = {
    used: false,
    message: `### Synthèse Cognitive Locale (${state.agentName})\nMission: ${state.prompt}\n- Statut: Analyse cognitive locale exécutée.\n- Recommandation: Exécution des primitives stratégiques et persistance synaptique terminées.`
  };
  const abort = new AbortController();
  const overrideTimeoutMs = Number(process.env.GENOS_LOCAL_MODEL_TIMEOUT_MS) || 0;
  const latencyBudgetMs = budgetLimit(state.executionBudget, 'latencyMs');
  const perAttemptTimeoutMs = overrideTimeoutMs > 0
    ? overrideTimeoutMs
    : (Number.isFinite(latencyBudgetMs) ? Math.max(120000, Math.floor(latencyBudgetMs * 0.6 / 3)) : 300000);
  const generation = withTextImmunity(state.framedPrompt, 'high', {
    validatorFn: griotValidator,
    maxRetries: 3,
    agentId: state.agentName,
    modelRouting: { model: state.mission.localModel || undefined, variantIndex: state.mission.variantIndex, policy: state.localRoutingPolicy, signal: abort.signal, timeoutMs: perAttemptTimeoutMs, responseFormat: state.mission.executionMode === 'worker' ? 'json_object' : undefined, enforceSchema: false,
      onResult: result => { state.observedRoute = require('../src/services/localCompletionEvidence').observedRoute(result); } },
    stemCellFallback: fallback.message,
    onFallback: () => { fallback.used = true; }
  });
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
    const timer = setTimeout(() => {
      abort.abort();
      reject(new Error(`Local generation exceeded latency budget (${timeoutMs}ms).`));
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

function validateGeneration(reply, fallback, state) {
  if (!reply) {
    throw new Error('Échec critique de la génération (Apoptose).');
  }
  if (fallback.used) {
    throw new Error(`Local model generation failed after retries. Fallback diagnostic: ${fallback.message}`);
  }
  const observedTokens = state.promptTokenEstimate + Math.ceil(Buffer.byteLength(String(reply), 'utf8') / 4);
  if (observedTokens > budgetLimit(state.executionBudget, 'tokens')) {
    throw new Error(`Local generation exceeded token budget (${observedTokens} > ${budgetLimit(state.executionBudget, 'tokens')}).`);
  }
  if (state.eventCount + 1 > budgetLimit(state.executionBudget, 'events')) {
    throw new Error(`Local runtime exceeded event budget (${state.eventCount + 1} > ${budgetLimit(state.executionBudget, 'events')}).`);
  }
}

async function runPostPipeline(services, state, reply) {
  try {
    await services.strategyExecutionAdapter.executePipelineWithFeedback(
      ['evaluate', 'stdp_update', 'cherry_pick_golden_path'],
      {
        agentId: state.mission.agentId || state.agentName,
        orchestratorId: state.mission.orchestratorAgentId || state.mission.agentId || state.agentName,
        workspaceId: state.mission.workspaceId || 'ws-genos-core',
        task: state.prompt,
        reply,
        turns: [
          { step: 1, action: 'cognitive_routing', classification: 'Breakthrough', success: true, detail: String(state.prompt).slice(0, 200) },
          { step: 2, action: 'runtime_execution', classification: 'Breakthrough', success: true, detail: String(reply).slice(0, 200) }
        ]
      }
    );
    await services.agentMemory.compileExecutionMemory(state.agentName, state.prompt, reply, { outcome: 'success', missionScope: state.mission.missionScope });
  } catch (e) {
    if (state.mission.runtimeCheckpointEnabled) throw e;
  }
}

function emitCompletion(state, reply) {
  const { buildDossierArtifact, buildWorkerArtifact } = require('../src/services/agents/workerArtifactContract');
  const workerKinds = require('../src/services/agents/workerKindService');
  const modelRef = String(state.mission.localModel || process.env.GENOS_LOCAL_MODEL || process.env.OLLAMA_MODEL || 'local-model');
  const provenance = { source: 'local-codex-runtime', model: modelRef, workspaceRoot: state.workspaceRoot, agentName: state.agentName, methodContract: state.mission.methodContract || null };
  const kind = workerKinds.resolveWorkerKind(state.mission.workerKind, state.mission.role);
  const workerArtifact = state.mission.executionMode === 'worker'
    ? buildWorkerArtifact(kind, reply, provenance)
    : buildDossierArtifact(reply, provenance);
  if (!workerArtifact) throw new Error(`Local model did not return a valid '${workerKinds.kindDefinition(kind).artifact}' artifact.`);
  const parsedReply = localSynthesis.parseCompletionReply(reply);
  const report = {
    outcome: 'success',
    claims: localSynthesis.reportClaims(parsedReply, reply, state),
    workerArtifact,
    author: { name: state.agentName, meaning: state.nameMeaning, role: state.mission.role || 'Assistant IA de développement' }
  };
  localSynthesis.attachInfluence(report, parsedReply);
  require('../src/services/localCompletionEvidence').attachFields(report, parsedReply);
  emitEvent(state, {
    eventType: 'EVIDENCE_REPORT',
    action: 'VERIFY_CLAIMS',
    detail: 'Local runtime emitted its structured evidence report.',
    payload: report
  });
  emitEvent(state, {
    eventType: 'AGENT_COMPLETED',
    action: 'COMPLETE',
    detail: 'Local cognitive router completed with Epigenetic Canalization.',
    status: 'completed',
    payload: state.observedRoute || {}
  });
}

function emitFailure(state, e) {
  const budgetBlocked = /budget|latency/i.test(e.message);
  emitEvent(state, {
    eventType: budgetBlocked ? 'AGENT_HALTED' : 'AGENT_FAILED',
    action: budgetBlocked ? 'BUDGET_GUARD' : 'ERROR',
    detail: e.message,
    severity: budgetBlocked ? 'warning' : 'error',
    status: budgetBlocked ? 'blocked' : 'error'
  });
}

async function buildPromptContext(state, services) {
  await buildStrategyContext(services.strategyExecutionAdapter, state);
  state.memoryBlock = await loadMemoryBlock(services.agentMemory, state);
  state.framedPrompt = buildFramedPrompt(state);
}

async function buildStrategyContext(adapter, state) {
  try {
    const memOutcome = await adapter.executePipelineWithFeedback(
      ['search_memory', 'compile_memory', 'search_failures'],
      { agentId: state.mission.agentId || state.agentName, orchestratorId: state.mission.orchestratorAgentId || state.mission.agentId || state.agentName, task: state.prompt, missionScope: state.mission.missionScope }
    );
    if (memOutcome && memOutcome.results && memOutcome.results.length) {
      state.strategyContext = `[STRATÉGIE GENOS ACTIVE : ${state.primaryStrategy}]\nPrimitives exécutées : ` +
        memOutcome.results.map((r) => `${r.primitive} (${r.result?.success ? 'OK' : 'FAIL'})`).join(', ') + '\n\n';
    }
  } catch (e) {}
}

async function loadMemoryBlock(agentMemory, state) {
  try {
    return await agentMemory.formatCognitiveMemoryPrompt(state.agentName, state.prompt, { missionScope: state.mission.missionScope });
  } catch (e) {
    return '';
  }
}

function buildFramedPrompt(state) {
  if (state.mission.executionMode !== 'worker') {
    return buildUncontractedPrompt(state);
  }
  const workerKinds = require('../src/services/agents/workerKindService');
  const kind = workerKinds.resolveWorkerKind(state.mission.workerKind, state.mission.role);
  const contract = state.mission.workerContract || workerKinds.buildWorkerContract(kind, {
    prompt: state.prompt, scope: state.workspaceRoot,
    orchestratorAgentId: state.mission.orchestratorAgentId
  });
  const evidenceRule = workerKinds.evidenceRule(contract);
  const instruction = evidenceRule
    ? `CONTRAT DE PREUVE OBLIGATOIRE : ${evidenceRule}\nLe format demandé dans la mission concerne la réponse finale de l'orchestrateur. En tant que worker, rends uniquement l'artefact JSON de ton contrat, avec ses champs et références de source.\n\n`
    : '';
  return buildUncontractedPrompt(state, instruction);
}

function buildUncontractedPrompt(state, evidenceInstruction = '') {
  return `${state.selfIntro} Tu disposes uniquement des informations présentes dans cette requête et dans le contexte ci-dessous. Le moteur local ne peut pas ouvrir lui-même les fichiers du workspace ni consulter Internet.
Si une source nécessaire manque, signale précisément cette limite. N'invente ni lecture de fichier, ni citation, ni résultat de vérification.

${state.conscienceBlock}

${state.agentSelfBlock || ''}

${state.workerSelfBlock || ''}

${state.memoryBlock}${state.strategyContext}${localArtifactInstruction(state.allowFileEdits)}
PLANS D'ACTION: Lorsque tu proposes un plan d'action, tu dois SYSTÉMATIQUEMENT utiliser des listes de tâches Markdown (\`- [ ]\`).

${state.contextStr}Requête de l'utilisateur : ${state.prompt}\n\n${evidenceInstruction}`;
}

function resolveAgentIdentity(mission, agentIdentity) {
  let agentName = mission.name;
  let nameMeaning = mission.nameMeaning;
  let selfIntro = '';
  if (!agentName || agentName === 'Worker') {
    const generated = agentIdentity.generateAgentIdentity({ role: mission.role });
    agentName = generated.name;
    nameMeaning = generated.name_meaning;
    selfIntro = generated.introduction;
  } else {
    nameMeaning = nameMeaning || (agentIdentity.findIdentityByName(agentName)?.meaning || 'Assistant cognitif de GenOS');
    selfIntro = agentIdentity.formatSelfIntroduction(agentName, nameMeaning, mission.role);
  }
  return { agentName, nameMeaning, selfIntro };
}

async function loadConscienceBlock(mission, agentConscience) {
  const helper = require('../src/services/agentSelfBlocks');
  return helper.loadConscienceText(null, mission.agentId, agentConscience);
}

function buildWorkspaceContext() {
  let contextStr = '';
  try {
    const fs = require('fs');
    const cwd = process.cwd();
    const projectName = process.env.GRIOT_PROJECT_NAME || path.basename(cwd);
    let extraInfo = '';
    const readmePath = path.join(cwd, 'README.md');
    if (fs.existsSync(readmePath)) {
      extraInfo += '\nExtrait du README : ' + fs.readFileSync(readmePath, 'utf8').substring(0, 500) + '...';
    } else {
      const pkgPath = path.join(cwd, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        extraInfo += `\nDescription package.json : ${pkg.description || 'Aucune'}`;
      }
    }
    const files = fs.readdirSync(cwd)
      .filter((f) => !f.startsWith('.') && f !== 'node_modules' && f !== 'dist')
      .slice(0, 30)
      .join(', ');
    contextStr = `[CONTEXTE DU WORKSPACE ACTIF : Projet "${projectName}"]\nFichiers à la racine : ${files}${extraInfo}\n\n`;
  } catch (e) {}
  return contextStr;
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (e) {
    return {};
  }
}

function budgetLimit(executionBudget, key) {
  const value = Number(executionBudget[key]);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
}

function emitEvent(state, event) {
  state.eventCount += 1;
  process.stdout.write(encodeEvent(event));
}
