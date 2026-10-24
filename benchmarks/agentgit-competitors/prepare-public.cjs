'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function prepare(outputDir) {
  const root = path.resolve(__dirname, '..', '..');
  const sources = require('./public-sources.json').sources;
  const revisions = Object.fromEntries(sources.map((source) => [source.system, source.package || source.revision]));
  revisions.GenOS = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const adapter = path.join(__dirname, 'public-adapter.cjs');
  const systems = ['GenOS', 'Contexa', 'LangGraph', 'Letta', 'DGM'].map((name) => ({
    name, version: revisions[name], adapter: process.execPath, args: [adapter, name, revisions[name]]
  }));
  const manifest = { schema: 'genos.agentgit-benchmark-manifest/v1',
    description: 'Deterministic branch isolation only; other metrics are not run.',
    tasks: [{ id: 'branch-isolation', input: { base: 'base-marker', candidate: 'candidate-marker' } }],
    systems };
  fs.mkdirSync(outputDir, { recursive: true });
  const target = path.join(outputDir, 'manifest.public.json');
  fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}

if (require.main === module) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Usage: node prepare-public.cjs <output-directory>');
  process.stdout.write(`${prepare(directory)}\n`);
}

module.exports = { prepare };
