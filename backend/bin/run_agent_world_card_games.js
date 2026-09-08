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

const MISSION = [
  'Build, from scratch and end to end, a rich browser-based card games website',
  '("GenOS Card Casino") featuring Klondike Solitaire, Spider Solitaire, FreeCell,',
  'Pyramid and TriPeaks, with a large amount of supporting features:',
  'drag-and-drop play, undo/redo, hints, auto-complete, timer, move counter, scoring,',
  'persistent statistics, achievements, daily challenge, seeded deals, difficulty levels,',
  'themes (light/dark + card backs), sound effects, keyboard shortcuts and responsive layout.'
].join(' ');

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
/* architectural constitution shared by every agent                    */
/* ------------------------------------------------------------------ */

const CONSTITUTION = `
ARCHITECTURAL CONSTITUTION (binding for every agent, never violate):
- Pure static website. No build step, no bundler, no npm, no frameworks, no CDN, no network calls.
- Plain ES5/ES2017 CLASSIC scripts only. NEVER use "import" or "export" or "require".
  The site must run by opening index.html directly from the file:// protocol.
- Every script attaches to the single global namespace object "CC" (window.CC).
  A script starts with: (function (CC) { 'use strict'; ... })(window.CC = window.CC || {});
- Cards are rendered as DOM elements styled by CSS. No external images, no image files.
  Card suit symbols use unicode characters. All art is CSS.
- Persistence uses window.localStorage under keys prefixed with "cc.".
- Sound uses the WebAudio API oscillators only (no audio files).
- Code must be defensive: never throw at load time, guard every DOM lookup.
`.trim();

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
/* phase 4 — shell: index.html + stylesheet                            */
/* ------------------------------------------------------------------ */

async function phaseShell(state, spec, arch) {
  log('Phase 4: UI agent is building the shell...');
  const ui = spec.team.find((m) => /ui|ux|front|design/i.test(m.role)) || spec.team[spec.team.length - 1];
  const scripts = arch.modules.map((m) => `  <script src="${m.path}"></script>`).join('\n');

  if (!state.artifacts['css/styles.css'] || !fs.existsSync(path.join(WORLD_DIR, 'css/styles.css'))) {
    const cssPrompt = `${ui.introduction}
You are the UI designer of ${spec.project_name}.
${CONSTITUTION}

Write the COMPLETE stylesheet for a polished card games site.
It must style: app shell with header/nav//footer, a game menu grid of 5 game cards
(${spec.games.map((g) => g.name).join(', ')}), the play area, playing cards rendered purely in CSS
(face-up/face-down, red/black suits, rounded corners, shadows, hover and dragging states),
tableau/foundation/stock/waste piles with fanned stacking offsets, toolbar buttons, a statistics
modal, an achievements panel, settings panel, toast notifications, a win overlay,
light AND dark themes driven by [data-theme] on <html>, CSS custom properties for the palette,
and a responsive layout down to 480px.
No external fonts, no images, no @import.

Reply with NOTHING except:
[ARTIFACT: css/styles.css]
...css...
[/ARTIFACT]`;

    const css = await withCodeImmunity(cssPrompt, {
      agentId: ui.agent_name,
      expectedPath: 'css/styles.css',
      maxRetries: 4,
      validate: (code) => {
        if (code.length < 2000) throw new Error(`Stylesheet too small (${code.length} chars); write the full stylesheet.`);
        if (/@import|url\(\s*['"]?https?:/i.test(code)) throw new Error('No @import and no remote url() allowed.');
        const open = (code.match(/\{/g) || []).length;
        const close = (code.match(/\}/g) || []).length;
        if (open !== close) throw new Error(`Unbalanced braces in CSS (${open} "{" vs ${close} "}").`);
        if (!/\[data-theme/.test(code)) throw new Error('Missing [data-theme] dark theme rules.');
      }
    });
    if (css) {
      writeArtifact('css/styles.css', css + '\n');
      state.artifacts['css/styles.css'] = { status: 'built', owner: ui.agent_name, bytes: css.length };
      saveState(state);
      log(`  [ok] css/styles.css (${css.length} chars)`);
    } else {
      log('  [APOPTOSIS] stylesheet failed.');
    }
  }

  if (!state.artifacts['index.html'] || !fs.existsSync(path.join(WORLD_DIR, 'index.html'))) {
    const htmlPrompt = `${ui.introduction}
You are assembling the entry point of ${spec.project_name} — ${spec.tagline}.
${CONSTITUTION}

Write index.html: a complete single-page shell containing
- header with the project name, theme toggle, and a nav to switch games,
- a game menu section with one card per game (${spec.games.map((g) => `${g.id}: ${g.name}`).join(', ')}) using data-game="<id>",
- the play area with containers for stock, waste, foundations and tableau,
- a toolbar (new game, restart, undo, redo, hint, auto-complete, pause) using data-action="<name>",
- status bar with timer, moves and score,
- statistics modal, achievements panel, settings panel, toast container, win overlay,
- footer.
Link <link rel="stylesheet" href="css/styles.css">.
Include the script tags EXACTLY in this order at the end of <body>:
${scripts}

Reply with NOTHING except:
[ARTIFACT: index.html]
...html...
[/ARTIFACT]`;

    const html = await withCodeImmunity(htmlPrompt, {
      agentId: ui.agent_name,
      expectedPath: 'index.html',
      maxRetries: 4,
      validate: (code) => {
        if (!/<!DOCTYPE html>/i.test(code)) throw new Error('Missing <!DOCTYPE html>.');
        if (!/css\/styles\.css/.test(code)) throw new Error('Missing stylesheet link.');
        const missing = arch.modules.filter((m) => !code.includes(m.path)).map((m) => m.path);
        if (missing.length) throw new Error(`index.html must include a <script> tag for every module. Missing: ${missing.join(', ')}.`);
        if (!/<\/html>/i.test(code)) throw new Error('Document is truncated: missing </html>.');
      }
    });
    if (html) {
      writeArtifact('index.html', html + '\n');
      state.artifacts['index.html'] = { status: 'built', owner: ui.agent_name, bytes: html.length };
      saveState(state);
      log(`  [ok] index.html (${html.length} chars)`);
    } else {
      log('  [APOPTOSIS] index.html failed.');
    }
  }
}

/* ------------------------------------------------------------------ */
/* phase 5 — QA: syntax sweep + self-repair                            */
/* ------------------------------------------------------------------ */

async function phaseQA(state, spec, arch) {
  log('Phase 5: QA agent is auditing every artifact...');
  const qa = spec.team.find((m) => /qa|test|quality|review/i.test(m.role)) || spec.team[0];
  const report = [];

  for (const mod of arch.modules) {
    const abs = path.join(WORLD_DIR, mod.path);
    if (!fs.existsSync(abs)) { report.push({ path: mod.path, status: 'missing' }); continue; }
    const code = fs.readFileSync(abs, 'utf8');
    try {
      checkJsSyntax(code, mod.path);
      report.push({ path: mod.path, status: 'ok', bytes: code.length });
    } catch (e) {
      log(`  [repair] ${mod.path}: ${e.message}`);
      const fixed = await withCodeImmunity(
        `You are ${qa.agent_name}, QA engineer for ${spec.project_name}.
${CONSTITUTION}

The file ${mod.path} (namespace ${mod.namespace}) fails to parse with: "${e.message}"

Here is the broken file:
${code}

Return the corrected, complete file. Preserve all working behaviour.
Reply with NOTHING except [ARTIFACT: ${mod.path}] ... [/ARTIFACT].`,
        {
          agentId: qa.agent_name,
          expectedPath: mod.path,
          maxRetries: 3,
          validate: (c) => { checkJsSyntax(c, mod.path); if (!c.includes('window.CC')) throw new Error('wrapper lost'); }
        }
      );
      if (fixed) {
        writeArtifact(mod.path, fixed + '\n');
        report.push({ path: mod.path, status: 'repaired', bytes: fixed.length });
        log(`  [repaired] ${mod.path}`);
      } else {
        report.push({ path: mod.path, status: 'broken', error: e.message });
      }
    }
  }

  state.qaReport = report;
  saveState(state);
  const ok = report.filter((r) => r.status === 'ok' || r.status === 'repaired').length;
  log(`  QA: ${ok}/${report.length} modules parse cleanly.`);
  return report;
}

/* ------------------------------------------------------------------ */
/* phase 6 — documentation                                             */
/* ------------------------------------------------------------------ */

async function phaseDocs(state, spec, arch) {
  if (state.artifacts && state.artifacts['README.md']) { log('Phase 6: README already present, skipping.'); return; }
  log('Phase 6: writing project documentation...');
  const scribe = spec.team[spec.team.length - 1];
  const readme = [
    `# ${spec.project_name}`,
    '',
    `> ${spec.tagline}`,
    '',
    'Built end to end by an autonomous GenOS agent world — no human wrote a line of this project.',
    '',
    '## Games',
    ...spec.games.map((g) => `- **${g.name}** — ${g.summary}`),
    '',
    '## Features',
    ...spec.features.map((f) => `- ${f}`),
    '',
    '## Run it',
    '',
    'Open `index.html` in any modern browser. There is no build step and no dependency.',
    '',
    '## Architecture',
    '',
    'Classic scripts sharing a single `CC` global namespace, loaded in dependency order:',
    '',
    '```',
    ...arch.modules.map((m) => `${m.path.padEnd(34)} ${m.namespace}`),
    '```',
    '',
    '## The agent world',
    '',
    '| Agent | Role | Mission |',
    '| --- | --- | --- |',
    ...spec.team.map((m) => `| ${m.agent_name} | ${m.role} | ${m.mission} |`),
    ''
  ].join('\n');
  writeArtifact('README.md', readme);
  state.artifacts = state.artifacts || {};
  state.artifacts['README.md'] = { status: 'built', owner: scribe.agent_name, bytes: readme.length };
  saveState(state);
  log('  [ok] README.md');
}

/* ------------------------------------------------------------------ */
/* phase 7 — runtime verification in a real browser + self-repair      */
/* ------------------------------------------------------------------ */

function startStaticServer(root) {
  const http = require('http');
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(String(req.url).split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Load the site headlessly, exercise every game, and collect runtime failures. */
async function probeRuntime(browser, url, spec, arch) {
  const page = await browser.newPage();
  const errors = [];
  // Thrown non-Error values (e.g. plain strings) have no stack, so fall back explicitly.
  const describe = (e) => {
    if (e == null) return 'unknown error';
    if (typeof e === 'string') return e;
    return String(e.stack || e.message || e) || String(e.name || 'unknown error');
  };
  page.on('pageerror', (e) => errors.push(describe(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));

  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));

  const namespaces = arch.modules.map((m) => m.namespace);
  const missing = await page.evaluate((names) => {
    const absent = [];
    if (!window.CC) return ['window.CC is not defined at all'];
    names.forEach((n) => {
      const parts = n.split('.').slice(1);
      let cur = window.CC;
      for (const p of parts) {
        if (cur == null || typeof cur[p] === 'undefined') { absent.push(n); return; }
        cur = cur[p];
      }
    });
    return absent;
  }, namespaces);
  missing.forEach((n) => errors.push(`namespace ${n} was never defined on window.CC`));

  // Exercise each game through its menu button.
  for (const game of spec.games) {
    const before = errors.length;
    try {
      const clicked = await page.evaluate((id) => {
        const el = document.querySelector(`[data-game="${id}"]`);
        if (!el) return false;
        el.click();
        return true;
      }, game.id);
      if (!clicked) errors.push(`no clickable [data-game="${game.id}"] element exists in index.html`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      errors.push(`clicking game ${game.id} threw: ${e.message}`);
    }
    if (errors.length > before) {
      errors.push(`the above failure(s) happened while starting game "${game.id}"`);
    }
  }

  await page.close();
  return errors;
}

/** Map a runtime error to the module file it came from. */
function attributeError(message, arch) {
  for (const mod of arch.modules) {
    if (message.includes(mod.path)) return mod.path;
    if (message.includes(`namespace ${mod.namespace} `)) return mod.path;
    const leaf = mod.namespace.split('.').pop();
    if (new RegExp(`setting '${leaf}'|reading '${leaf}'`).test(message)) return mod.path;
  }
  // Messages thrown as plain strings carry no stack, so fall back to vocabulary matching.
  for (const mod of arch.modules) {
    const leaf = path.basename(mod.path, '.js');
    if (new RegExp(`\\b${leaf}s?\\b`, 'i').test(message)) return mod.path;
  }
  return null;
}

async function phaseRuntimeRepair(state, spec, arch) {
  log('Phase 7: runtime verification in a headless browser...');
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch (_) {
    log('  puppeteer unavailable; skipping runtime verification.');
    return;
  }

  const server = await startStaticServer(WORLD_DIR);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({ headless: 'new' });
  const qa = spec.team.find((m) => /qa|test|quality|review/i.test(m.role)) || spec.team[0];
  const rounds = Number(process.env.GENOS_RUNTIME_ROUNDS || 4);
  const history = [];

  try {
    for (let round = 1; round <= rounds; round++) {
      const errors = await probeRuntime(browser, url, spec, arch);
      const unique = [...new Set(errors)];
      history.push({ round, errorCount: unique.length });
      log(`  round ${round}: ${unique.length} runtime error(s)`);
      unique.slice(0, 12).forEach((e) => log(`    ! ${e.split('\n')[0].slice(0, 160)}`));
      if (!unique.length) { log('  runtime is clean.'); break; }
      if (round === rounds) { log('  round budget exhausted.'); break; }

      // Group failures per file and let the owning agent repair them.
      const byFile = new Map();
      const unattributed = [];
      unique.forEach((msg) => {
        const file = attributeError(msg, arch);
        if (!file) { unattributed.push(msg); return; }
        if (!byFile.has(file)) byFile.set(file, []);
        byFile.get(file).push(msg);
      });
      if (unattributed.length) {
        // index.html owns anything that is not traceable to a module.
        byFile.set('index.html', (byFile.get('index.html') || []).concat(unattributed));
      }

      for (const [file, msgs] of byFile) {
        const abs = path.join(WORLD_DIR, file);
        if (!fs.existsSync(abs)) continue;
        const current = fs.readFileSync(abs, 'utf8');
        const mod = arch.modules.find((m) => m.path === file);
        log(`  [runtime-repair] ${file} (${msgs.length} error(s)) by ${qa.agent_name}`);

        const isHtml = file.endsWith('.html');
        const prompt = `${qa.introduction}
You are fixing REAL runtime errors observed in a headless browser for ${spec.project_name}.
${CONSTITUTION}

MODULE LOAD ORDER (scripts run top to bottom, each attaches to the global CC):
${arch.modules.map((m) => `${m.path} -> ${m.namespace}`).join('\n')}

FILE UNDER REPAIR: ${file}${mod ? ` (must define ${mod.namespace})` : ''}

OBSERVED RUNTIME ERRORS:
${msgs.map((m, i) => `${i + 1}. ${m.split('\n').slice(0, 3).join(' | ')}`).join('\n')}

CURRENT CONTENT:
${current}

Fix the ROOT CAUSE of every error above.
Common causes to check: a parent namespace object (for example CC.Games) is used before anything creates it,
a helper is called via the wrong namespace, or DOM elements are read before they exist / without a null guard.
${mod ? `Make sure this file creates every namespace level it needs, e.g. CC.Games = CC.Games || {}; before assigning CC.Games.X.` : ''}
Keep all existing working behaviour and keep the file complete.

Reply with NOTHING except the full corrected file inside [ARTIFACT: ${file}] ... [/ARTIFACT].`;

        const fixed = await withCodeImmunity(prompt, {
          agentId: qa.agent_name,
          expectedPath: file,
          maxRetries: 3,
          validate: (code) => {
            if (isHtml) {
              if (!/<\/html>/i.test(code)) throw new Error('Document truncated: missing </html>.');
              const absent = arch.modules.filter((m) => !code.includes(m.path)).map((m) => m.path);
              if (absent.length) throw new Error(`index.html must keep a <script> tag for every module. Missing: ${absent.join(', ')}.`);
            } else {
              checkJsSyntax(code, file);
              if (!code.includes('window.CC')) throw new Error('The (function (CC) { ... })(window.CC = window.CC || {}) wrapper must be preserved.');
              if (/\b(?:import|export)\s/.test(code)) throw new Error('Module syntax is forbidden; keep classic scripts.');
            }
          }
        });

        if (fixed) {
          writeArtifact(file, fixed + '\n');
          log(`    [repaired] ${file}`);
        } else {
          log(`    [APOPTOSIS] could not repair ${file}`);
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  state.runtimeHistory = history;
  saveState(state);
}

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

  const spec = await phaseWorldSpec(state);
  const arch = await phaseArchitecture(state, spec);
  await phaseImplement(state, spec, arch);
  await phaseShell(state, spec, arch);
  await phaseQA(state, spec, arch);
  await phaseDocs(state, spec, arch);
  await phaseRuntimeRepair(state, spec, arch);

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
