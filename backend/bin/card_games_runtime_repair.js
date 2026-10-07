/**
 * Headless browser runtime verification and repair for Card Games agent world.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

function startStaticServer(root) {
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

function describeError(e) {
  if (e == null) return 'unknown error';
  if (typeof e === 'string') return e;
  return String(e.stack || e.message || e) || String(e.name || 'unknown error');
}

async function setupPageListeners(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(describeError(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  return errors;
}

async function checkNamespaces(page, arch) {
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
  return missing.map((n) => `namespace ${n} was never defined on window.CC`);
}

async function testGames(page, spec) {
  const errors = [];
  for (const game of spec.games) {
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
  }
  return errors;
}

async function probeRuntime({ browser, url, spec, arch }) {
  const page = await browser.newPage();
  const errors = await setupPageListeners(page);

  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));

  const namespaceErrors = await checkNamespaces(page, arch);
  errors.push(...namespaceErrors);

  const gameErrors = await testGames(page, spec);
  errors.push(...gameErrors);

  await page.close();
  return errors;
}

function getQaAgent(spec) {
  return spec.team.find((m) => /qa|test|quality|review/i.test(m.role)) || spec.team[0];
}

function groupErrorsByFile(errors, arch) {
  const byFile = new Map();
  const unattributed = [];
  errors.forEach((msg) => {
    const file = attributeError(msg, arch);
    if (!file) { unattributed.push(msg); return; }
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(msg);
  });
  if (unattributed.length) {
    byFile.set('index.html', (byFile.get('index.html') || []).concat(unattributed));
  }
  return byFile;
}

function buildRepairPrompt({ qa, spec, CONSTITUTION, arch, file, mod, msgs, current, isHtml }) {
  return `${qa.introduction}
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
}

function getValidationOptions(isHtml, arch) {
  return (code) => {
    if (isHtml) {
      if (!/<\/html>/i.test(code)) throw new Error('Document truncated: missing </html>.');
      const absent = arch.modules.filter((m) => !code.includes(m.path)).map((m) => m.path);
      if (absent.length) throw new Error(`index.html must keep a <script> tag for every module. Missing: ${absent.join(', ')}.`);
    } else {
      if (!code.includes('window.CC')) throw new Error('The (function (CC) { ... })(window.CC = window.CC || {}) wrapper must be preserved.');
      if (/\b(?:import|export)\s/.test(code)) throw new Error('Module syntax is forbidden; keep classic scripts.');
    }
  };
}

async function repairFile({ file, msgs, qa, spec, arch, helpers, WORLD_DIR }) {
  const abs = path.join(WORLD_DIR, file);
  if (!fs.existsSync(abs)) return;
  const current = fs.readFileSync(abs, 'utf8');
  const mod = arch.modules.find((m) => m.path === file);
  const isHtml = file.endsWith('.html');
  helpers.log(`  [runtime-repair] ${file} (${msgs.length} error(s)) by ${qa.agent_name}`);

  const prompt = buildRepairPrompt({ qa, spec, CONSTITUTION: helpers.CONSTITUTION, arch, file, mod, msgs, current, isHtml });

  const fixed = await helpers.withCodeImmunity(prompt, {
    agentId: qa.agent_name,
    expectedPath: file,
    maxRetries: 3,
    validate: getValidationOptions(isHtml, arch)
  });

  if (fixed) {
    helpers.writeArtifact(file, fixed + '\n');
    helpers.log(`    [repaired] ${file}`);
  } else {
    helpers.log(`    [APOPTOSIS] could not repair ${file}`);
  }
}

async function runRepairRound({ round, browser, url, spec, arch, helpers, WORLD_DIR, qa, history, log }) {
  const errors = await probeRuntime({ browser, url, spec, arch });
  const unique = [...new Set(errors)];
  history.push({ round, errorCount: unique.length });
  log(`  round ${round}: ${unique.length} runtime error(s)`);
  unique.slice(0, 12).forEach((e) => log(`    ! ${e.split('\n')[0].slice(0, 160)}`));
  if (!unique.length) { log('  runtime is clean.'); return true; }
  if (round === Number(process.env.GENOS_RUNTIME_ROUNDS || 4)) { log('  round budget exhausted.'); return true; }

  const byFile = groupErrorsByFile(unique, arch);
  for (const [file, msgs] of byFile) {
    await repairFile({ file, msgs, qa, spec, arch, helpers, WORLD_DIR });
  }
  return false;
}

async function phaseRuntimeRepair({ helpers, state, spec, arch }) {
  const { log, WORLD_DIR, saveState, checkJsSyntax, withCodeImmunity, writeArtifact, CONSTITUTION } = helpers;
  log('Phase 7: runtime verification in a headless browser...');
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch (_) {
    log('  puppeteer unavailable; skipping runtime verification.');
    return;
  }

  const server = await startStaticServer(WORLD_DIR);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await puppeteer.launch({ headless: 'new' });
  const qa = getQaAgent(spec);
  const rounds = Number(process.env.GENOS_RUNTIME_ROUNDS || 4);
  const history = [];

  try {
    for (let round = 1; round <= rounds; round++) {
      const done = await runRepairRound({ round, browser, url, spec, arch, helpers, WORLD_DIR, qa, history, log });
      if (done) break;
    }
  } finally {
    await browser.close();
    server.close();
  }

  state.runtimeHistory = history;
  saveState(state);
}

module.exports = {
  startStaticServer,
  probeRuntime,
  attributeError,
  phaseRuntimeRepair
};
