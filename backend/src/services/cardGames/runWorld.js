'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const immuneSystem = require('../immuneSystem');
const { askLocalLLM, withImmunity, formatPainSignal } = immuneSystem;
const agentIdentity = require('../agentIdentityService');
const aTeamService = require('../aTeamService');
const { phaseShell, phaseDocs, phaseQA, MISSION, CONSTITUTION } = require('../../bin/card_games_shell_docs');
const { phaseRuntimeRepair } = require('../../bin/card_games_runtime_repair');

const WORLD_DIR = path.resolve(process.env.GENOS_WORLD_DIR || path.resolve(__dirname, '../../../genos-card-casino'));
const META_DIR = path.join(WORLD_DIR, '.genos-world');
const STATE_FILE = path.join(META_DIR, 'state.json');
const LOG_FILE = path.join(META_DIR, 'build.log');

const CODE_ROUTING = { maxTokens: 8000, timeoutMs: 900000 };
const PLAN_ROUTING = { maxTokens: 8000, timeoutMs: 900000 };

immuneSystem.askLocalLLM = (...request) => askLocalLLM(...request, PLAN_ROUTING);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  process.stderr.write(line + '\n');
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf8'); } catch (_) {}
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) { return {}; }
}

function saveState(state) {
  fs.mkdirSync(META_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function checkJsSyntax(code) {
  try {
    new vm.Script(code, { filename: 'artifact' });
    return true;
  } catch (e) {
    return e.message;
  }
}

function withCodeImmunity(prompt, routing, retries = 3) {
  return withImmunity(prompt, routing, retries, (err) => formatPainSignal(err, 'code'));
}

function writeArtifact(relPath, content) {
  const abs = path.join(WORLD_DIR, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

async function phaseWorldSpec(state) {
  log('Phase: World Specification');
  const prompt = `MISSION: ${MISSION}

Produce a concise SPEC.md for a card games web app (Go Fish, Crazy Eights, War, Solitaire).
Target: single-page vanilla JS + CSS, no frameworks, works offline.
Output: JSON with keys { spec, features, ui, dataModel, acceptanceCriteria }.
Constraints: no external deps, < 50KB total, accessibility (ARIA), responsive.`;
  const out = await withCodeImmunity(prompt, PLAN_ROUTING);
  const parsed = JSON.parse(out);
  state.spec = parsed;
  saveState(state);
  log('Spec phase complete');
  return parsed;
}

async function phaseArchitecture(state) {
  log('Phase: Architecture');
  const prompt = `Given this spec: ${JSON.stringify(state.spec)}

Design the architecture for a vanilla JS card games app.
Output JSON: { modules, dataFlow, stateManagement, routing, files }.
Modules: deck, games (goFish, crazyEights, war, solitaire), ui, storage, engine.
Files: index.html, styles.css, app.js, games/*.js, engine.js, storage.js.`;
  const out = await withCodeImmunity(prompt, PLAN_ROUTING);
  const parsed = JSON.parse(out);
  state.arch = parsed;
  saveState(state);
  log('Architecture phase complete');
  return parsed;
}

async function phaseImplement(state) {
  log('Phase: Implementation');
  const prompt = `Implement the card games app per this architecture: ${JSON.stringify(state.arch)}

Write each file as a separate artifact with path and content.
Output JSON array of { path, content, type }.
Types: html, css, js, json.
Include: index.html, styles.css, app.js, engine.js, storage.js, games/goFish.js, games/crazyEights.js, games/war.js, games/solitaire.js, games/deck.js.`;
  const out = await withCodeImmunity(prompt, CODE_ROUTING);
  const artifacts = JSON.parse(out);
  for (const artifact of artifacts) {
    const abs = writeArtifact(artifact.path, artifact.content);
    log(`Created: ${artifact.path} (${artifact.type})`);
  }
  state.artifacts = artifacts.reduce((acc, a) => ({ ...acc, [a.path]: { status: 'built', type: a.type } }), {});
  saveState(state);
  log('Implementation phase complete');
}

async function runWorld() {
  log('='.repeat(70));
  log('GenOS Agent World — Card Games Construction');
  log('='.repeat(70));
  log(`World dir: ${WORLD_DIR}`);

  const state = loadState();
  state.mission = MISSION;
  state.startedAt = state.startedAt || new Date().toISOString();
  saveState(state);

  const helpers = { log, WORLD_DIR, saveState, checkJsSyntax, withCodeImmunity, writeArtifact, CONSTITUTION };
  const spec = await phaseWorldSpec(state);
  const arch = await phaseArchitecture(state);
  await phaseImplement(state);
  await phaseShell(helpers, state, spec, arch);
  await phaseQA(helpers, state, spec, arch);
  await phaseDocs(helpers, state, spec, arch);
  await phaseRuntimeRepair({ helpers, state, spec, arch });

  state.finishedAt = new Date().toISOString();
  saveState(state);

  const built = Object.values(state.artifacts || {}).filter((a) => a.status === 'built').length;
  const failed = Object.values(state.artifacts || {}).filter((a) => a.status === 'failed').length;
  log('='.repeat(70));
  log(`DONE. artifacts built=${built} failed=${failed}`);
  log(`World: ${WORLD_DIR}`);
  log('='.repeat(70));
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = { runWorld, log, WORLD_DIR, saveState, checkJsSyntax, withCodeImmunity, writeArtifact, CONSTITUTION, MISSION };