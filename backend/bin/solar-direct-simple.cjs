#!/usr/bin/env node
/**
 * Solar-direct runtime simplifié — appelle Solar directement sans les dépendances DB bloquantes.
 */
'use strict';
const solarTools = require('./solar-tool-runtime.cjs');
const { credentials } = require('./solarDirectContext.cjs');
const { encodeEvent, decodeMissionInput } = require('../src/services/runtimeProtocol');

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => {
  let mission;
  try { mission = decodeMissionInput(raw); }
  catch { mission = JSON.parse(raw.toString('utf8').trim()); }
  await main(mission);
});

async function main(mission) {
  validateCredentials();
  const state = buildState(mission);
  emitPlanCreated(state);
  try {
    const reply = await callSolarApi(state);
    validateAndEmitReply(reply, state);
  } catch (e) {
    emitError(state, e);
    process.exit(1);
  }
}

function validateCredentials() {
  if (!credentials?.accessToken) {
    console.error('[solar-direct] ERREUR: token OAuth Nous absent');
    process.exit(2);
  }
}

function buildState(mission) {
  const name = mission.name || 'SolarAgent';
  const agentId = mission.agentId || 'solar_direct';
  const prompt = mission.prompt || mission.currentTask || 'Aucune tâche.';
  return {
    mission,
    prompt,
    agentName: name,
    nameMeaning: 'Agent Solar de GenOS',
    selfIntro: `Je m'appelle ${name}, un agent cognitif de GenOS alimenté par Solar Pro via l'API Nous.`,
    executionBudget: {
      tokens: Number(process.env.GENOS_SOLAR_MAX_TOKENS || 8000),
      latencyMs: Number(process.env.GENOS_SOLAR_TIMEOUT_MS || 30000)
    },
    startedAt: Date.now(),
    tokensUsed: 0,
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    abortController: new AbortController(),
    eventCount: 0,
    allowFileEdits: false,
    workspaceRoot: process.cwd(),
    framedPrompt: `Tu es ${name}, un assistant IA de GenOS alimenté par Solar Pro via l'API Nous.\n\n${prompt}`
  };
}

function emitPlanCreated(state) {
  console.error(`[solar-direct] agent=${state.agentName} (${state.mission.agentId || 'solar_direct'}) model=${process.env.GENOS_SOLAR_MODEL || 'solar-pro4:free'}`);
  console.error(`[solar-direct] credentials: OK`);
  console.error(`[solar-direct] appel Solar pour: ${state.prompt.slice(0, 80)}...`);
  emitEvent(state, {
    eventType: 'AGENT_PLAN_CREATED',
    action: 'PLAN',
    detail: 'Mission acceptée par Solar-direct.',
    status: 'running',
    currentTask: state.prompt
  });
}

async function callSolarApi(state) {
  return solarTools.callSolar({
    request: {
      model: process.env.GENOS_SOLAR_MODEL || 'solar-pro4:free',
      messages: [{ role: 'user', content: state.framedPrompt }],
      max_tokens: Math.min(4000, state.executionBudget.tokens),
      temperature: 0.5,
      top_p: 0.95
    },
    state
  });
}

function validateAndEmitReply(reply, state) {
  const text = solarTools.responseText(reply);
  if (!text || !text.trim()) throw new Error('Solar a retourné une réponse vide');
  if (text.length < 10) throw new Error('Solar a retourné une réponse trop courte');
  state.tokensUsed = Number(reply.usage?.total_tokens || 0);
  state.usage = reply.usage || state.usage;
  emitEvent(state, {
    eventType: 'AGENT_COMPLETED',
    action: 'COMPLETE',
    detail: 'Mission terminée.',
    status: 'completed',
    payload: { text, usage: state.usage }
  });
  process.stdout.write(JSON.stringify({ status: 'completed', agentId: state.mission.agentId || 'solar_direct', text, usage: state.usage }) + '\n');
  process.exit(0);
}

function emitError(state, e) {
  console.error('[solar-direct] ERREUR:', e.message);
  emitEvent(state, {
    eventType: 'AGENT_FAILED',
    action: 'ERROR',
    detail: e.message,
    severity: 'error',
    status: 'error'
  });
}

function emitEvent(state, event) {
  state.eventCount += 1;
  try { process.stdout.write(encodeEvent(event)); } catch (_) {}
}
