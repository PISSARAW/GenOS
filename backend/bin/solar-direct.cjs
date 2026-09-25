#!/usr/bin/env node
/**
 * GenOS runtime: Solar Pro direct via l'API Nous.
 * Pattern: identique au local-codex-runtime.cjs (protobuf framing, événements encodés,
 * pipeline post-génération) mais le moteur cognitif est Solar appelé directement
 * via l'API OpenAI-compatible du provider Nous (token OAuth depuis auth.json Hermes).
 */
'use strict';
console.log = (...args) => process.stderr.write(args.map(String).join(' ') + '\n');
console.info = (...args) => process.stderr.write(args.map(String).join(' ') + '\n');

const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');
const agentIdentity = require('../src/services/agentIdentityService');
const agentConscience = require('../src/services/agentConscienceService');
const strategyExecutionAdapter = require('../src/services/strategyExecutionAdapter');
const agentMemory = require('../src/services/agentMemoryContext');
const solarTools = require('./solar-tool-runtime.cjs');
const path = require('path');
const fs = require('fs');

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => { await main(raw); });

async function main(rawInput) {
  let mission;
  try { mission = decodeMissionInput(rawInput); }
  catch { process.exit(2); }

  const prompt = mission.prompt || mission.currentTask || 'Aucune tâche fournie.';
  const contextStr = buildWorkspaceContext();

  const identity = resolveAgentIdentity(mission, agentIdentity);
  const conscienceBlock = await loadConscienceBlock(mission, agentConscience);

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
    toolLease: parseToolLease(mission.toolLeaseJson),
    localRoutingPolicy: parseJson(mission.localRoutingPolicyJson),
    workspaceRoot: path.resolve(mission.workspaceRoot || process.cwd()),
    allowFileEdits: false,
    promptTokenEstimate: Math.ceil(Buffer.byteLength(String(prompt), 'utf8') / 4),
    eventCount: 0,
    observedTools: new Set(),
    recordedTurns: [],
    startedAt: Date.now(),
    abortController: new AbortController(),
    tokensUsed: 0,
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    costUsd: 0,
    primaryStrategy: (() => { try { return JSON.parse(mission.strategyContractJson || '{}').selected_strategy?.primary || 'deterministic_direct_path'; } catch { return 'deterministic_direct_path'; } })(),
    strategyContext: '',
    memoryBlock: '',
    framedPrompt: ''
  };
  state.allowFileEdits = state.executionPolicy.allowFileEdits === true;
  state.primaryStrategy = state.strategyContract?.selected_strategy?.primary || 'deterministic_direct_path';

  const services = { strategyExecutionAdapter, agentMemory };
  await buildPromptContext(state, services);
  state.promptTokenEstimate = Math.ceil(Buffer.byteLength(state.framedPrompt, 'utf8') / 4);
  await runMission(state, services);
}

function parseToolLease(value) {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? [...new Set(parsed.filter((name) => typeof name === 'string'))] : [];
}

async function runMission(state, services) {
  emitEvent(state, {
    eventType: 'AGENT_PLAN_CREATED',
    action: 'PLAN',
    detail: 'GenOS Solar-direct runtime accepted the mission (Solar via Nous API).',
    status: 'running',
    currentTask: state.prompt
  });
  try {
    guardBudget(state);
    const tools = solarTools.loadLeasedTools(state.toolLease);
    const reply = await solarTools.runToolSession({
      state,
      tools,
      sample: ({ request, state: sessionState }) => solarTools.callSolar({ request, state: sessionState }),
      callTool: ({ invocation, state: sessionState }) => solarTools.callLeasedTool({ invocation, state: sessionState }),
      emit: (event) => emitEvent(state, event)
    });
    validateGeneration(reply, state);
    writeArtifacts(reply, state);
    try { await runPostPipeline(services, state, reply); } catch (postErr) { console.error('Post-pipeline error:', postErr.message); }
    guardCompletionBudget(state);
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
    eventType: 'AGENT_HALTED', action: 'BUDGET_GUARD',
    detail: `Prompt consumes the local token budget (${state.promptTokenEstimate} >= ${budgetLimit(state.executionBudget, 'tokens')}).`,
    severity: 'warning', status: 'blocked'
  });
  process.exit(1);
}

function validateGeneration(reply, state) {
  if (!String(reply || '').trim()) throw new Error('Solar returned an empty response.');
  if (String(reply).length < 10) throw new Error('Solar response is too short to verify.');
  if (state.tokensUsed > budgetLimit(state.executionBudget, 'tokens')) throw new Error(`Solar generation exceeded token budget (${state.tokensUsed} > ${budgetLimit(state.executionBudget, 'tokens')}).`);
}

function guardCompletionBudget(state) {
  if (state.eventCount + 1 > budgetLimit(state.executionBudget, 'events')) throw new Error(`Solar runtime exceeded event budget (${state.eventCount + 1} > ${budgetLimit(state.executionBudget, 'events')}).`);
}

function writeArtifacts(reply, state) {
  const artifactRegex = /\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/gi;
  const deps = { fsLib: fs, pathLib: path, workspaceRoot: state.workspaceRoot, allowFileEdits: state.allowFileEdits };
  const writeErrors = [];
  let match;
  while ((match = artifactRegex.exec(reply)) !== null) {
    const error = writeArtifact(deps, match[1], match[2]);
    if (error) writeErrors.push(error);
  }
  if (writeErrors.length > 0) throw new Error(`Failed to write artifact files (${writeErrors.length} error(s)): ${writeErrors.join('; ')}`);
}

function writeArtifact(deps, filepathRaw, codeRaw) {
  const filepath = filepathRaw.trim();
  const code = codeRaw.trim();
  try {
    if (!deps.allowFileEdits) throw new Error(`File edits are not authorized by the GenOS execution policy for: ${filepath}`);
    const absPath = deps.pathLib.resolve(deps.workspaceRoot, filepath);
    const relativePath = deps.pathLib.relative(deps.workspaceRoot, absPath);
    if (relativePath.startsWith('..') || deps.pathLib.isAbsolute(relativePath)) throw new Error(`Artifact path escapes the mission workspace: ${filepath}`);
    deps.fsLib.mkdirSync(deps.pathLib.dirname(absPath), { recursive: true });
    deps.fsLib.writeFileSync(absPath, code);
    return null;
  } catch (e) { console.error('Erreur lors de l\'écriture du fichier:', e); return e.message; }
}

async function runPostPipeline(services, state, reply) {
  try {
    await services.strategyExecutionAdapter.executePipelineWithFeedback(
      ['evaluate', 'stdp_update', 'cherry_pick_golden_path'],
      { agentId: state.mission.agentId || state.agentName, orchestratorId: state.mission.orchestratorAgentId || state.mission.agentId || state.agentName, workspaceId: state.mission.workspaceId || 'ws-genos-core', task: state.prompt, reply, turns: state.recordedTurns }
    );
    await services.agentMemory.compileExecutionMemory(state.agentName, state.prompt, reply, { outcome: 'success' });
  } catch (e) {}
}

function emitCompletion(state, reply) {
  const { buildDossierArtifact } = require('../src/services/agents/workerArtifactContract');
  const modelRef = String((state.usage && state.usage.model) || process.env.GENOS_SOLAR_MODEL || 'solar-model');
  const provenance = { source: 'solar-direct', model: modelRef, workspaceRoot: state.workspaceRoot, agentName: state.agentName };
  const report = {
    outcome: 'success',
    claims: [{ statement: reply, evidence: [state.selfIntro] }],
    workerArtifact: buildDossierArtifact(reply, provenance),
    author: { name: state.agentName, meaning: state.nameMeaning, role: state.mission.role || 'Assistant IA de développement' }
  };
  emitEvent(state, {
    eventType: 'AGENT_COMPLETED', action: 'COMPLETE',
    detail: 'GenOS Solar-direct runtime completed via Solar API (Nous).',
    status: 'completed', payload: { evidenceReport: report, usage: state.usage }
  });
}

function emitFailure(state, e) {
  const budgetBlocked = /budget|latency/i.test(e.message);
  emitEvent(state, {
    eventType: budgetBlocked ? 'AGENT_HALTED' : 'AGENT_FAILED',
    action: budgetBlocked ? 'BUDGET_GUARD' : 'ERROR',
    detail: e.message,
    severity: budgetBlocked ? 'warning' : 'error',
    status: budgetBlocked ? 'blocked' : 'error',
    payload: { usage: state.usage, observedToolCalls: state.recordedTurns.length }
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
  try { return await agentMemory.formatCognitiveMemoryPrompt(state.agentName, state.prompt); } catch (e) { return ''; }
}

function buildFramedPrompt(state) {
  return `${state.selfIntro} Tu exécutes une mission GenOS sous un bail d'outils MCP limité. Utilise les outils accordés pour obtenir des données ou effectuer des actions, et base tes affirmations sur les résultats réellement reçus.
Outils MCP autorisés : ${state.toolLease.join(', ') || 'aucun'}.
N'invente pas l'accès à des fichiers, sites, services ou outils. Ne demande jamais l'exécution d'un outil absent du bail. Une mission sans outil adapté doit signaler clairement cette limite.

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
    // Éviter le blocage sur getDatabase() dans le runtime solar-direct direct
    // (la fonction peut attendre indéfiniment si la base n'est pas accessible).
    // On skip la charge de conscience dans ce runtime direct.
    if (false && mission.agentId) {
      const { getDatabase } = require('../src/db');
      const db = await getDatabase();
      conscienceState = await agentConscience.loadConscienceState(db, mission.agentId);
    }
  } catch (_) {}
  return agentConscience.formatConsciencePrompt(conscienceState);
}

function buildWorkspaceContext() {
  let contextStr = '';
  try {
    const cwd = process.cwd();
    const projectName = process.env.GRIOT_PROJECT_NAME || path.basename(cwd);
    let extraInfo = '';
    const readmePath = path.join(cwd, 'README.md');
    if (fs.existsSync(readmePath)) extraInfo += '\nExtrait du README : ' + fs.readFileSync(readmePath, 'utf8').substring(0, 500) + '...';
    else {
      const pkgPath = path.join(cwd, 'package.json');
      if (fs.existsSync(pkgPath)) { const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); extraInfo += `\nDescription package.json : ${pkg.description || 'Aucune'}`; }
    }
    const files = fs.readdirSync(cwd).filter((f) => !f.startsWith('.') && f !== 'node_modules' && f !== 'dist').slice(0, 30).join(', ');
    contextStr = `[CONTEXTE DU WORKSPACE ACTIF : Projet "${projectName}"]\nFichiers à la racine : ${files}${extraInfo}\n\n`;
  } catch (e) {}
  return contextStr;
}

function parseJson(value) { try { return JSON.parse(value || '{}'); } catch (e) { return {}; } }
function budgetLimit(executionBudget, key) { const value = Number(executionBudget[key]); return Number.isFinite(value) && value > 0 ? value : Infinity; }
function emitEvent(state, event) { state.eventCount += 1; process.stdout.write(encodeEvent(event)); }
