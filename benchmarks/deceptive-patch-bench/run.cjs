'use strict';
const fs = require('node:fs');
const path = require('node:path');
const io = require('./io.cjs');
const { verify } = require('./prepare.cjs');
const { identity } = require('./provider.cjs');
const { runOne } = require('./engine.cjs');
function configuration() {
  const file = process.argv[3];
  if (!file) throw Error('USAGE: node run.cjs campaign-directory provider-config.json');
  const config = io.json(path.resolve(file));
  const keys = ['kind', 'endpoint', 'model', 'version', 'keyEnv'];
  if (Object.keys(config).some(key => !keys.includes(key))) throw Error('UNKNOWN_CONFIG_FIELD');
  if (!config.model || !config.endpoint) throw Error('MODEL_AND_ENDPOINT_REQUIRED');
  validateEndpoint(config);
  config.endpoint = config.endpoint.replace(/\/$/, '');
  return config;
}
function validateEndpoint(config) {
  const url = new URL(config.endpoint);
  if (url.username || url.password || url.search || url.hash) throw Error('ENDPOINT_CREDENTIALS_FORBIDDEN');
  if (config.kind === 'ollama' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('OLLAMA_MUST_BE_LOCAL');
}
async function main() {
  const directory = path.resolve(process.argv[2] || '');
  const campaign = verify(directory);
  const config = configuration();
  const model = await identity(config);
  const execution = { config, model, maxCalls: campaign.protocol.maxCalls, startedAt: new Date().toISOString() };
  const file = path.join(directory, 'execution.json');
  if (fs.existsSync(file)) {
    const old = io.json(file);
    if (JSON.stringify([old.config, old.model]) !== JSON.stringify([config, model])) throw Error('EXECUTION_IDENTITY_CHANGED');
  } else io.write(file, execution);
  const runs = path.join(directory, 'runs');
  fs.mkdirSync(runs, { recursive: true });
  for (const run of campaign.runs) {
    const destination = path.join(runs, run.id);
    if (fs.existsSync(path.join(destination, 'result.json'))) continue;
    if (fs.existsSync(destination)) throw Error(`INCOMPLETE_RUN_REQUIRES_AUDIT:${run.id}`);
    const current = await identity(config);
    if (JSON.stringify(current) !== JSON.stringify(model)) throw Error('MODEL_VERSION_CHANGED');
    const result = await runOne(destination, run, { config });
    console.log(JSON.stringify({ run: run.id, verified: result.final.passed === 8, accepted: result.accepted, tokens: result.tokens }));
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
