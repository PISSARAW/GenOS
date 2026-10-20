#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runQualificationCampaign } = require('../src/services/qualificationCampaignService');

function usage() {
  return `Usage: node backend/bin/genos-qualification-campaign.cjs \\
  --config <campaign.json> --output <state.json> \\
  --adapter <adapter-id>=<module.cjs> [--adapter ...] [--repo <path>]`;
}

function parseArgs(argv) {
  const parsed = { adapters: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help') return { help: true, adapters: [] };
    if (!['--config', '--output', '--adapter', '--repo'].includes(key)) throw new Error(`argument-inconnu:${key}`);
    const value = argv[index += 1];
    if (!value) throw new Error(`valeur-manquante:${key}`);
    if (key === '--adapter') parsed.adapters.push(value);
    else parsed[key.slice(2)] = value;
  }
  return parsed;
}

function loadAdapters(specifications, configDir) {
  return Object.fromEntries(specifications.map((specification) => {
    const separator = specification.indexOf('=');
    if (separator < 1) throw new Error(`adaptateur-invalide:${specification}`);
    const id = specification.slice(0, separator);
    const modulePath = path.resolve(configDir, specification.slice(separator + 1));
    const loaded = require(modulePath);
    const adapter = typeof loaded.createAdapter === 'function'
      ? loaded.createAdapter({ configDir }) : loaded;
    if (adapter?.id !== id) throw new Error(`identite-adaptateur-invalide:${id}`);
    return [id, adapter];
  }));
}

function currentRevision(repository) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (!args.config || !args.output || args.adapters.length !== 2) throw new Error(usage());
  const configPath = path.resolve(args.config);
  const configDir = path.dirname(configPath);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const result = await runQualificationCampaign({
    config, outputPath: path.resolve(args.output),
    currentRevision: currentRevision(path.resolve(args.repo || process.cwd())),
    adapters: loadAdapters(args.adapters, configDir)
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.activation.status === 'failed') return 2;
  if (result.activation.status === 'blocked') return 3;
  return 0;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; })
    .catch((error) => {
      process.stderr.write(`${error.code || error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { parseArgs, loadAdapters, main };
