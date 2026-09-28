'use strict';

// Shared helpers for the wiring inventory generators (Phase 1).
// Each inventory keeps its own scope; this module only factors out
// filesystem access so every generator stays under the quality gate.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function listFiles(directory, extensions) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      return listFiles(path.relative(root, child), extensions);
    }
    const kept = !extensions || extensions.some((ext) => entry.name.endsWith(ext));
    return kept ? [relative(child)] : [];
  }).sort();
}

function readText(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function toolNames(catalog) {
  const tools = catalog.tools || catalog;
  return tools.map((tool) => tool.name).sort();
}

function emit(result, summary) {
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(summary + '\n');
  }
}

module.exports = { root, relative, listFiles, readText, readJson, toolNames, emit };
