#!/usr/bin/env node
/**
 * GenOS Agent World — autonomous end-to-end construction of a card games site.
 *
 * Runs a full A-to-Z project with GenOS's own cognitive stack:
 *   modelRouter (routing)  + immuneSystem (validated retries / pain signals)
 *   agentIdentityService (agent identities) + aTeamService (team composition)
 *   [ARTIFACT: path] extraction -> real files written to disk.
 *
 * The run is resumable: completed artifacts are kept and skipped on re-run.
 */
'use strict';

process.env.GENOS_DEFAULT_MODEL = process.env.GENOS_DEFAULT_MODEL || 'ollama://qwen2.5:14b';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const immuneSystem = require('../src/services/immuneSystem.js');
const { askLocalLLM, withImmunity, formatPainSignal } = immuneSystem;
const agentIdentity = require('../src/services/agentIdentityService');
const aTeamService = require('../src/services/aTeamService');
const { phaseShell, phaseDocs, phaseQA, MISSION, CONSTITUTION } = require('./card_games_shell_docs');
const { phaseRuntimeRepair } = require('./card_games_runtime_repair');

const WORLD_DIR = path.resolve(process.env.GENOS_WORLD_DIR || 'C:/Users/Shadow/Documents/GitHub/genos-card-casino');
const META_DIR = path.join(WORLD_DIR, '.genos-world');
const STATE_FILE = path.join(META_DIR, 'state.json');
const LOG_FILE = path.join(META_DIR, 'build.log');

// askLocalLLM caps output at 3000 tokens by default; code and plans need more headroom.
const CODE_ROUTING = { maxTokens: 8000, timeoutMs: 900000 };
const PLAN_ROUTING = { maxTokens: 8000, timeoutMs: 900000 };

// withImmunity resolves askLocalLLM through module.exports, so the budget is raised there.
immuneSystem.askLocalLLM = (prompt, complexity, agentId, variantIndex) =>
  askLocalLLM(prompt, complexity, agentId, variantIndex, PLAN_ROUTING);

/* ------------------------------------------------------------------ */
/* infrastructure                                                      */
/* ------------------------------------------------------------------ */

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

/** Write an artifact inside the world, refusing any path escape. */
function writeArtifact(relPath, content) {
  const abs = path.resolve(WORLD_DIR, relPath);
  const rel = path.relative(WORLD_DIR, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Artifact path escapes the world workspace: ${relPath}`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

/** GenOS's native artifact convention. */
function extractArtifact(reply, expectedPath) {
  const re = /\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/gi;
  let m;
  let fallback = null;
  while ((m = re.exec(reply)) !== null) {
    const p = m[1].trim();
    const body = m[2].replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
    if (!body) continue;
    if (p === expectedPath) return body;
    if (!fallback) fallback = body;
  }
  return fallback;
}

function checkJsSyntax(code, filename) {
  new vm.Script(code, { filename });
}

/* ------------------------------------------------------------------ */
/* code immune loop: GenOS routing + pain-signal retries + validators  */
/* ------------------------------------------------------------------ */

async function withCodeImmunity(basePrompt, { agentId, validate, maxRetries = 4, expectedPath, variantIndex = 0 }) {
  let prompt = basePrompt;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log(`  [immune:${agentId}] attempt ${attempt}/${maxRetries} (variant ${variantIndex + attempt - 1})`);
    const raw = await askLocalLLM(prompt, 'high', agentId, variantIndex + attempt - 1, CODE_ROUTING);
    if (!raw) {
      prompt = `${basePrompt}\n\n[PAIN SIGNAL] Previous attempt produced no output. Answer with the artifact only.`;
      continue;
    }
    try {
      const body = extractArtifact(raw, expectedPath);
      if (!body) throw new Error(`No [ARTIFACT: ${expectedPath}] ... [/ARTIFACT] block found in the reply.`);
      validate(body);
      log(`  [homeostasis:${agentId}] artifact validated (${body.length} chars)`);
      return body;
    } catch (e) {
      log(`  [inflammation:${agentId}] ${e.message}`);
      if (attempt === maxRetries) return null;
      prompt = `${basePrompt}\n\n${formatPainSignal(e.message, `while producing ${expectedPath}`)}\n` +
        `Fix this exact problem and re-emit the COMPLETE file inside [ARTIFACT: ${expectedPath}] ... [/ARTIFACT].`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* phase 1 — orchestrator defines the world (team + scope)             */
/* ------------------------------------------------------------------ */

async function phaseWorldSpec(state) {
  if (state.worldSpec) { log('Phase 1: world spec already present, skipping.'); return state.worldSpec; }
  log('Phase 1: orchestrator is defining the agent world...');

  const analysis = aTeamService.analyzeMission(MISSION);
  log(`  aTeamService: recommended=${analysis.recommended} domains=${JSON.stringify(analysis.detectedDomains)}`);

  const prompt = `You are the GenOS Orchestrator (HOX gene) launching an autonomous agent world.
MISSION: ${MISSION}

Detected technical domains: ${JSON.stringify(analysis.detectedDomains)}.

Produce ONLY a JSON object, no prose, with this exact shape:
{
  "project_name": "GenOS Card Casino",
  "tagline": "<short tagline>",
  "games": [ { "id": "klondike", "name": "Klondike Solitaire", "summary": "<1 sentence>" }, ... 5 games: klondike, spider, freecell, pyramid, tripeaks ],
  "features": [ "<feature>", ... at least 12 concrete user-facing features ],
  "team": [ { "role": "<role id, snake_case>", "domain": "<domain>", "mission": "<1 sentence>" }, ... exactly 6 roles ]
}`;

  const validator = (d) => {
    if (!d || typeof d !== 'object') throw new Error('Root must be an object.');
    if (!Array.isArray(d.games) || d.games.length !== 5) throw new Error('games must be an array of exactly 5 entries.');
    const ids = d.games.map((g) => g && g.id);
    for (const required of ['klondike', 'spider', 'freecell', 'pyramid', 'tripeaks']) {
      if (!ids.includes(required)) throw new Error(`games must include id "${required}". Got ${JSON.stringify(ids)}.`);
    }
    if (!Array.isArray(d.features) || d.features.length < 12) throw new Error('features must list at least 12 strings.');
    if (!Array.isArray(d.team) || d.team.length !== 6) throw new Error('team must contain exactly 6 roles.');
    d.team.forEach((t) => { if (!t.role || !t.mission) throw new Error('each team member needs role and mission.'); });
  };

  const spec = await withImmunity(prompt, 'high', validator, 4, 'genos_orchestrator');
  if (!spec) throw new Error('Orchestrator failed to define the world (apoptosis).');

  // Give every agent a GenOS identity, keeping names unique so ownership lookups resolve.
  const takenNames = new Set();
  spec.team = spec.team.map((member) => {
    let id = agentIdentity.generateAgentIdentity({ role: member.role });
    for (let tries = 0; takenNames.has(id.name) && tries < 25; tries++) {
      id = agentIdentity.generateAgentIdentity({ role: member.role });
    }
    let name = id.name;
    if (takenNames.has(name)) name = `${name}-${takenNames.size + 1}`;
    takenNames.add(name);
    const introduction = agentIdentity.formatSelfIntroduction(name, id.name_meaning, member.role);
    return { ...member, agent_name: name, name_meaning: id.name_meaning, introduction };
  });

  state.worldSpec = spec;
  saveState(state);
  log(`  world defined: ${spec.games.length} games, ${spec.features.length} features, ${spec.team.length} agents`);
  spec.team.forEach((m) => log(`    - ${m.agent_name} (${m.role}) : ${m.mission}`));
  return spec;
}

/* ------------------------------------------------------------------ */
/* phase 2 — architect fixes the module contract                       */
/* ------------------------------------------------------------------ */

/**
 * The kernel modules are contractual: their API is what every game depends on,
 * so the architect declares them explicitly before any implementation starts.
 */
async function phaseArchitecture(state, spec) {
  if (state.architecture) { log('Phase 2: architecture already present, skipping.'); return state.architecture; }
  log('Phase 2: architect is fixing the module contract...');

  const architect = spec.team.find((m) => /arch/i.test(m.role)) || spec.team[0];

  const prompt = `You are ${architect.agent_name}, the software architect of the GenOS agent world.
${CONSTITUTION}

PROJECT: ${spec.project_name} — ${spec.tagline}
GAMES: ${spec.games.map((g) => `${g.id} (${g.name})`).join(', ')}
FEATURES: ${spec.features.join('; ')}

Design the module graph. Produce ONLY a JSON object, no prose:
{
  "modules": [
    { "path": "js/core/cards.js", "namespace": "CC.Cards", "purpose": "<1 sentence>",
      "api": ["createDeck(numDecks)", "shuffle(cards, rng)", "..."], "depends_on": [] },
    ...
  ]
}
Rules:
- Order the array in SCRIPT LOAD ORDER: a module may only depend on modules listed before it.
- Include core modules first (rng/seeding, cards+deck model, storage, stats, achievements, sound, themes, undo history, hint engine, drag-and-drop, base game engine, renderer/UI shell),
  then EXACTLY one module per game under js/games/<id>.js with namespace CC.Games.<Id>,
  then js/app.js last as the bootstrapper.
- Use between 16 and 20 modules total.
- "api" lists 2 to 6 concrete function signatures the module exposes on its namespace.
- Keep it COMPACT: "purpose" must be under 90 characters and each api signature under 40 characters.
  Emit minified-style JSON without indentation so the whole object fits in one answer.`;

  const validator = (d) => {
    if (!d || !Array.isArray(d.modules)) throw new Error('Root must have a "modules" array.');
    if (d.modules.length < 16 || d.modules.length > 20) throw new Error(`modules must contain 16..20 entries, got ${d.modules.length}.`);
    const paths = new Set();
    d.modules.forEach((m, i) => {
      if (!m.path || !/^js\/[\w./-]+\.js$/.test(m.path)) throw new Error(`module ${i} has an invalid path: ${JSON.stringify(m.path)} (must match js/**/*.js).`);
      if (paths.has(m.path)) throw new Error(`duplicate module path ${m.path}.`);
      paths.add(m.path);
      if (!m.namespace || !/^CC\./.test(m.namespace)) throw new Error(`module ${m.path} must declare a namespace starting with "CC.".`);
      if (m.api != null && !Array.isArray(m.api)) throw new Error(`module ${m.path} has an "api" field that is not an array.`);
    });
    for (const g of spec.games) {
      if (!paths.has(`js/games/${g.id}.js`)) throw new Error(`missing game module js/games/${g.id}.js.`);
    }
    const last = d.modules[d.modules.length - 1];
    if (last.path !== 'js/app.js') throw new Error('the last module must be js/app.js.');
  };

  const arch = await withImmunity(prompt, 'high', validator, 5, architect.agent_name);
  if (!arch) throw new Error('Architect failed to produce a module contract (apoptosis).');

  // Assign an implementer to every module (games go to their own specialists).
  const implementers = spec.team.filter((m) => m !== architect);
  arch.modules.forEach((m, i) => {
    m.owner = implementers[i % implementers.length].agent_name;
    m.api = Array.isArray(m.api) ? m.api.filter((s) => typeof s === 'string' && s.trim()) : [];
  });

  state.architecture = arch;
  saveState(state);
  log(`  contract fixed: ${arch.modules.length} modules`);
  arch.modules.forEach((m) => log(`    ${m.path}  ->  ${m.namespace}  [${m.owner}]`));
  return arch;
}

/* ------------------------------------------------------------------ */
/* phase 3 — implementers write every module                           */
/* ------------------------------------------------------------------ */

function contractDigest(modules, upToIndex) {
  return modules.slice(0, upToIndex)
    .map((m) => `${m.path} -> ${m.namespace}: ${m.api.length ? m.api.join(', ') : m.purpose}`)
    .join('\n');
}

async function phaseImplement(state, spec, arch) {
  log('Phase 3: implementers are writing the modules...');
  state.artifacts = state.artifacts || {};

  for (let i = 0; i < arch.modules.length; i++) {
    const mod = arch.modules[i];
    const abs = path.join(WORLD_DIR, mod.path);
    if (state.artifacts[mod.path] && fs.existsSync(abs)) {
      log(`  [skip] ${mod.path} already built.`);
      continue;
    }
    const owner = spec.team.find((m) => m.agent_name === mod.owner) || spec.team[0];
    log(`  [build] ${mod.path} by ${owner.agent_name} (${owner.role})`);

    const isGame = mod.path.startsWith('js/games/');
    const game = isGame ? spec.games.find((g) => `js/games/${g.id}.js` === mod.path) : null;

    const prompt = `${owner.introduction}
You are implementing one module of ${spec.project_name}.
${CONSTITUTION}

ALREADY AVAILABLE MODULES (loaded before yours, you may call them):
${contractDigest(arch.modules, i) || '(none — you are the first module)'}

YOUR MODULE
  path:      ${mod.path}
  namespace: ${mod.namespace}
  purpose:   ${mod.purpose}
  api:       ${mod.api.length ? mod.api.join(', ') : '(left open by the architect - design a coherent API that fulfils the purpose)'}
${isGame && game ? `  game:      ${game.name} — ${game.summary}\n  This module must implement the COMPLETE, CORRECT rules of ${game.name}: dealing, legal-move validation, win detection, scoring and auto-complete.` : ''}

PROJECT FEATURES this module should support where relevant: ${spec.features.join('; ')}

Write the COMPLETE, production-quality implementation. Requirements:
- Implement every function of the api above (or the API you design if it was left open). No TODO, no placeholder, no "..." elisions.
- Self-contained and defensive; must not throw when the script loads.
- Attach everything to ${mod.namespace}.
- Substantial implementation (aim for 120-320 lines).

Reply with NOTHING except the file wrapped exactly like this:
[ARTIFACT: ${mod.path}]
(function (CC) {
  'use strict';
  ...your code...
})(window.CC = window.CC || {});
[/ARTIFACT]`;

    const validate = (code) => {
      checkJsSyntax(code, mod.path);
      if (/\b(?:import|export)\s/.test(code) || /\brequire\s*\(/.test(code)) {
        throw new Error('Module syntax is forbidden: remove every import/export/require, use classic scripts.');
      }
      if (!code.includes('window.CC')) throw new Error('The file must use the (function (CC) { ... })(window.CC = window.CC || {}) wrapper.');
      const leaf = mod.namespace.split('.').slice(1).join('.');
      if (leaf && !code.includes(leaf.split('.')[0])) throw new Error(`The file must define ${mod.namespace}.`);
      if (code.length < 900) throw new Error(`Implementation is too small (${code.length} chars); write the full module.`);
      if (/TODO|FIXME|your code here|\.\.\.\s*$/im.test(code)) throw new Error('Placeholders detected; deliver a complete implementation.');
    };

    const code = await withCodeImmunity(prompt, {
      agentId: owner.agent_name,
      validate,
      expectedPath: mod.path,
      maxRetries: 4,
      variantIndex: i
    });

    if (!code) {
      log(`  [APOPTOSIS] ${mod.path} could not be produced; recording failure.`);
      state.artifacts[mod.path] = { status: 'failed', owner: owner.agent_name };
      saveState(state);
      continue;
    }
    writeArtifact(mod.path, code + '\n');
    state.artifacts[mod.path] = { status: 'built', owner: owner.agent_name, bytes: code.length };
    saveState(state);
    log(`  [ok] ${mod.path} (${code.length} chars)`);
  }
  return state.artifacts;
}

/* ------------------------------------------------------------------ */
/* phase 5 — QA: syntax sweep + self-repair                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */

(async () => {
  fs.mkdirSync(META_DIR, { recursive: true });
  log('='.repeat(70));
  log(`GenOS Agent World -> ${WORLD_DIR}`);
  log(`model: ${process.env.GENOS_DEFAULT_MODEL}`);
  log('='.repeat(70));

  const state = loadState();
  state.mission = MISSION;
  state.startedAt = state.startedAt || new Date().toISOString();
  saveState(state);

  const helpers = { log, WORLD_DIR, saveState, checkJsSyntax, withCodeImmunity, writeArtifact, CONSTITUTION };
  const spec = await phaseWorldSpec(state);
  const arch = await phaseArchitecture(state, spec);
  await phaseImplement(state, spec, arch);
  await phaseShell(helpers, state, spec, arch);
  await phaseQA(helpers, state, spec, arch);
  await phaseDocs(helpers, state, spec, arch);
  await phaseRuntimeRepair(helpers, state, spec, arch);

  state.finishedAt = new Date().toISOString();
  saveState(state);

  const built = Object.values(state.artifacts || {}).filter((a) => a.status === 'built').length;
  const failed = Object.values(state.artifacts || {}).filter((a) => a.status === 'failed').length;
  log('='.repeat(70));
  log(`DONE. artifacts built=${built} failed=${failed}`);
  log(`World: ${WORLD_DIR}`);
  log('='.repeat(70));
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  log(`FATAL: ${e.stack || e.message}`);
  process.exit(1);
});
