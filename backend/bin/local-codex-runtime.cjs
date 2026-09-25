#!/usr/bin/env node
console.log = (...args) => process.stderr.write(args.map(String).join(' ') + '\n');
console.info = (...args) => process.stderr.write(args.map(String).join(' ') + '\n');

const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');
const modelRouter = require('../src/services/modelRouter');
const path = require('path');

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => {
  await main(raw);
});

async function main(rawInput) {
  let mission;
  try {
    mission = decodeMissionInput(rawInput);
  } catch (e) {
    process.exit(2);
  }

  const prompt = mission.prompt || mission.currentTask || 'No prompt provided';
  const contextStr = buildWorkspaceContext();

  const agentIdentity = require('../src/services/agentIdentityService');
  const agentConscience = require('../src/services/agentConscienceService');
  const identity = resolveAgentIdentity(mission, agentIdentity);
  const conscienceBlock = await loadConscienceBlock(mission, agentConscience);

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
    executionPolicy: parseJson(mission.executionPolicyJson),
    executionBudget: parseJson(mission.executionBudgetJson),
    localRoutingPolicy: parseJson(mission.localRoutingPolicyJson),
    workspaceRoot: path.resolve(mission.workspaceRoot || process.cwd()),
    allowFileEdits: false,
    promptTokenEstimate: Math.ceil(Buffer.byteLength(String(prompt), 'utf8') / 4),
    eventCount: 0,
    primaryStrategy: '',
    strategyContext: '',
    memoryBlock: '',
    framedPrompt: ''
  };
  state.allowFileEdits = state.executionPolicy.allowFileEdits === true;
  state.primaryStrategy = state.strategyContract.selected_strategy?.primary || 'deterministic_direct_path';

  const services = { strategyExecutionAdapter, agentMemory };
  await buildPromptContext(state, services);
  await runMission(state, services);
}

async function runMission(state, services) {
  emitEvent(state, {
    eventType: 'AGENT_PLAN_CREATED',
    action: 'PLAN',
    detail: 'Local cognitive router runtime accepted the mission.',
    status: 'running',
    currentTask: state.prompt
  });
  guardBudget(state);
  try {
    const generation = createGeneration(state);
    const reply = await awaitGeneration(state, generation.generation, generation.abort);
    validateGeneration(reply, generation.fallback, state);
    writeArtifacts(reply, state);
    await runPostPipeline(services, state, reply);
    emitCompletion(state, reply);
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
  };
  const fallback = {
    used: false,
    message: `### Synthèse Cognitive Locale (${state.agentName})\nMission: ${state.prompt}\n- Statut: Analyse cognitive locale exécutée.\n- Recommandation: Exécution des primitives stratégiques et persistance synaptique terminées.`
  };
  const abort = new AbortController();
  const overrideTimeoutMs = Number(process.env.GENOS_LOCAL_MODEL_TIMEOUT_MS) || 0;
  const latencyBudgetMs = budgetLimit(state.executionBudget, 'latencyMs');
  // 3 essais immunitaires possibles × timeout par essai. Il faut laisser assez
  // de temps pour que Ollama réponde 3 fois (phagocytose). Budget par essai
  // = 60% du budget total pour avoir la marge sur 3 tentatives.
  const perAttemptTimeoutMs = overrideTimeoutMs > 0
    ? overrideTimeoutMs
    : (Number.isFinite(latencyBudgetMs) ? Math.max(120000, Math.floor(latencyBudgetMs * 0.6 / 3)) : 300000);
  const generation = withTextImmunity(state.framedPrompt, 'high', {
    validatorFn: griotValidator,
    maxRetries: 3,
    agentId: state.agentName,
    modelRouting: { model: state.mission.localModel || undefined, policy: state.localRoutingPolicy, signal: abort.signal, timeoutMs: perAttemptTimeoutMs },
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

function writeArtifacts(reply, state) {
  const artifactRegex = /\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/gi;
  const deps = {
    fsLib: require('fs'),
    pathLib: require('path'),
    workspaceRoot: state.workspaceRoot,
    allowFileEdits: state.allowFileEdits
  };
  const writeErrors = [];
  let match;
  while ((match = artifactRegex.exec(reply)) !== null) {
    const error = writeArtifact(deps, match[1], match[2]);
    if (error) writeErrors.push(error);
  }
  if (writeErrors.length > 0) {
    throw new Error(`Failed to write artifact files (${writeErrors.length} error(s)): ${writeErrors.join('; ')}`);
  }
}

function writeArtifact(deps, filepathRaw, codeRaw) {
  const filepath = filepathRaw.trim();
  const code = codeRaw.trim();
  try {
    if (!deps.allowFileEdits) throw new Error(`File edits are not authorized by the GenOS execution policy for: ${filepath}`);
    const absPath = deps.pathLib.resolve(deps.workspaceRoot, filepath);
    const relativePath = deps.pathLib.relative(deps.workspaceRoot, absPath);
    if (relativePath.startsWith('..') || deps.pathLib.isAbsolute(relativePath)) {
      throw new Error(`Artifact path escapes the mission workspace: ${filepath}`);
    }
    deps.fsLib.mkdirSync(deps.pathLib.dirname(absPath), { recursive: true });
    deps.fsLib.writeFileSync(absPath, code);
    return null;
  } catch (e) {
    console.error("Erreur lors de l'ecriture du fichier:", e);
    return e.message;
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
    await services.agentMemory.compileExecutionMemory(state.agentName, state.prompt, reply, { outcome: 'success' });
  } catch (e) {}
}

function emitCompletion(state, reply) {
  const { buildDossierArtifact } = require('../src/services/agents/workerArtifactContract');
  const modelRef = String(state.mission.localModel || process.env.GENOS_LOCAL_MODEL || process.env.OLLAMA_MODEL || 'local-model');
  const provenance = { source: 'local-codex-runtime', model: modelRef, workspaceRoot: state.workspaceRoot, agentName: state.agentName };
  const report = {
    outcome: 'success',
    claims: [{ statement: reply, evidence: [state.selfIntro] }],
    workerArtifact: buildDossierArtifact(reply, provenance),
    author: { name: state.agentName, meaning: state.nameMeaning, role: state.mission.role || 'Assistant IA de développement' }
  };
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
    payload: {}
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
      { agentId: state.mission.agentId || state.agentName, orchestratorId: state.mission.orchestratorAgentId || state.mission.agentId || state.agentName, task: state.prompt }
    );
    if (memOutcome && memOutcome.results && memOutcome.results.length) {
      state.strategyContext = `[STRATÉGIE GENOS ACTIVE : ${state.primaryStrategy}]\nPrimitives exécutées : ` +
        memOutcome.results.map((r) => `${r.primitive} (${r.result?.success ? 'OK' : 'FAIL'})`).join(', ') + '\n\n';
    }
  } catch (e) {}
}

async function loadMemoryBlock(agentMemory, state) {
  try {
    return await agentMemory.formatCognitiveMemoryPrompt(state.agentName, state.prompt);
  } catch (e) {
    return '';
  }
}

function buildFramedPrompt(state) {
  return `${state.selfIntro} Tu as un accès TOTAL et DIRECT au "site" ou "projet" dont parle l'utilisateur, car il s'agit du code source local fourni ci-dessous.
RÈGLE ABSOLUE : Tu ne dois SOUS AUCUN PRÉTEXTE t'excuser, dire que tu es une IA générique, ou affirmer que tu n'as pas accès à internet. Tu incarnes ton rôle et ton identité (${state.agentName}). Tu AS déjà accès au site via les fichiers.
Si l'utilisateur te demande d'"explorer" ou d'"analyser" le site, réponds IMMÉDIATEMENT en te basant sur le contexte ci-dessous, sans aucune phrase d'avertissement.

${state.conscienceBlock}

${state.memoryBlock}${state.strategyContext}IMPORTANT / ARTÉFACTS OBLIGATOIRES: Si tu dois créer ou modifier un fichier, générer un document long, ou un plan d'implémentation, tu DOIS obligatoirement l'encadrer avec les balises \`[ARTIFACT: chemin/vers/fichier.ext]\` au début et \`[/ARTIFACT]\` à la fin. Ne mets pas ce contenu dans le chat standard et n'utilise pas de blocs de code pour cela.
PLANS D'ACTION: Lorsque tu proposes un plan d'action, tu dois SYSTÉMATIQUEMENT utiliser des listes de tâches Markdown (\`- [ ]\`).

${state.contextStr}Requête de l'utilisateur : ${state.prompt}`;
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
  let conscienceState = agentConscience.createConscienceState();
  try {
    const { getDatabase } = require('../src/db');
    const db = await getDatabase();
    if (mission.agentId) {
      conscienceState = await agentConscience.loadConscienceState(db, mission.agentId);
    }
  } catch (_) {}
  return agentConscience.formatConsciencePrompt(conscienceState);
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
