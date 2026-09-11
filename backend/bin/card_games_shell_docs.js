/**
 * UI Shell (HTML/CSS) and Documentation (README) generation for Card Games agent world.
 */
'use strict';

const fs = require('fs');
const path = require('path');

async function phaseShell(helpers, state, spec, arch) {
  const { log, WORLD_DIR, saveState, withCodeImmunity, writeArtifact, CONSTITUTION } = helpers;
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

async function phaseDocs(helpers, state, spec, arch) {
  const { log, saveState, writeArtifact } = helpers;
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

async function phaseQA(helpers, state, spec, arch) {
  const { log, WORLD_DIR, saveState, checkJsSyntax, withCodeImmunity, writeArtifact, CONSTITUTION } = helpers;
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

const MISSION = [
  'Build, from scratch and end to end, a rich browser-based card games website',
  '("GenOS Card Casino") featuring Klondike Solitaire, Spider Solitaire, FreeCell,',
  'Pyramid and TriPeaks, with a large amount of supporting features:',
  'drag-and-drop play, undo/redo, hints, auto-complete, timer, move counter, scoring,',
  'persistent statistics, achievements, daily challenge, seeded deals, difficulty levels,',
  'themes (light/dark + card backs), sound effects, keyboard shortcuts and responsive layout.'
].join(' ');

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

module.exports = {
  phaseShell,
  phaseDocs,
  phaseQA,
  MISSION,
  CONSTITUTION
};

