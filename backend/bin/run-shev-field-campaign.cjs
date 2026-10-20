#!/usr/bin/env node
'use strict';

const commands = require('../src/services/shev/developmentalFieldCampaignCliService');

function parse(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    if (!flag?.startsWith('--') || tokens[index + 1] === undefined) throw new Error(`Invalid argument: ${flag}`);
    options[flag.slice(2)] = tokens[index + 1];
  }
  return { command, options: { campaignDir: options['campaign-dir'],
    manifestPath: options.manifest, adapterPath: options.adapter } };
}

async function dispatch(parsed) {
  const table = { prepare: commands.prepare, seal: commands.seal, tick: commands.tick,
    status: commands.status, export: commands.exportCampaign };
  if (!table[parsed.command]) throw new Error('Usage: run-shev-field-campaign.cjs <prepare|seal|tick|status|export> --campaign-dir <path> [--manifest <path>] [--adapter <path>]');
  if (!parsed.options.campaignDir) throw new Error('--campaign-dir is required.');
  return table[parsed.command](parsed.options);
}

async function main() {
  const result = await dispatch(parse(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error.code || 'SHEV_FIELD_CLI_FAILED',
    message: error.message })}\n`);
  process.exitCode = 1;
});

module.exports = { parse, dispatch };
