'use strict';

// Integrations inventory: IDE, browser, computer-use, providers and external
// executables -> the adapter actually present in the tree.
// Scope: integrations/, examples/, backend/src (providers, browser, computer),
// backend/bin, crates (desktop command). Adapter presence is not a proof
// that the external side is connected or authorized.
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./inventory_lib');

function matching(start, extensions, pattern) {
  const found = [];
  const absolute = path.join(lib.root, start);
  if (!fs.existsSync(absolute)) return found;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(child); continue; }
      if (extensions.some((ext) => entry.name.endsWith(ext)) && pattern.test(entry.name)) {
        found.push(path.relative(lib.root, child).replace(/\\/g, '/'));
      }
    }
  };
  walk(absolute);
  return found.sort();
}

function ide() {
  return { contract: 'integrations/ide/genos-extension-contract.json',
    exists: fs.existsSync(path.join(lib.root, 'integrations/ide/genos-extension-contract.json')),
    backendAdapter: ['backend/src/routes/ideRoutes.js', 'backend/src/grpc_services/ideService.js']
      .filter((f) => fs.existsSync(path.join(lib.root, f))) };
}

function examples() {
  const dir = path.join(lib.root, 'examples');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => `examples/${e.name}`).sort();
}

function externalBinaries() {
  const files = lib.listFiles('backend/src/services', ['.js']);
  const names = new Set();
  for (const file of files) {
    const src = lib.readText(file);
    for (const m of src.matchAll(/(?:spawn|execFile|execSync|spawnSync)\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}

function audit() {
  const providers = matching('backend/src', ['.js'], /provider/i);
  const browser = matching('backend/src', ['.js', '.cjs', '.mjs'],
    /(browser|playwright|puppeteer|fovea|forag|computer.?use|screenshot)/i);
  const desktop = path.join(lib.root, 'crates/genos-cli/src/commands/desktop.rs');
  return { scope: 'integrations', method: 'adapter-file-enumeration',
    caveat: 'A present adapter file does not prove the external side is wired.',
    ide: ide(), examples: examples(), providers,
    browserForaging: browser,
    computerUse: { service: browser.filter((f) => /computer.?use/i.test(f)),
      desktopCommand: fs.existsSync(desktop) },
    externalBinaries: externalBinaries() };
}

if (require.main === module) {
  const result = audit();
  lib.emit(result, `integrations: ide contract ${result.ide.exists ? 'present' : 'missing'}, `
    + `${result.examples.length} examples, ${result.providers.length} provider modules, `
    + `${result.browserForaging.length} browser/foraging files, `
    + `external binaries [${result.externalBinaries.join(', ') || 'none detected'}].`);
}

module.exports = { audit };
