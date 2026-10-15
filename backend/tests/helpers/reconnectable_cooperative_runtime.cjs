'use strict';

const control = require('../../src/services/localRuntimeCooperativeControl');
const reconnect = require('../../src/services/localRuntimeReconnectBootstrap');

const input = JSON.parse(Buffer.from(process.env.GENOS_RECONNECT_FIXTURE, 'base64url').toString());
const state = { mission: input.lineage, framedPrompt: 'reconnectable runtime prompt' };
let runtime;
let stopped = false;

function send(message) {
  return new Promise((resolve, reject) => {
    process.send(message, error => { if (error) reject(error); else resolve(); });
  });
}

async function safeLoop() {
  while (!stopped) {
    await control.safePoint('prepared');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function main() {
  if (!control.bind(state)) throw new Error('Fixture control binding failed.');
  runtime = await reconnect.start({
    lineage: input.lineage,
    backendPublicKey: input.backendPublicKey,
    persistDescriptor: descriptor => send({ type: 'fixture-reconnect-descriptor', descriptor })
  });
  await safeLoop();
}

async function shutdown() {
  stopped = true;
  if (runtime) await runtime.close();
  process.exit(0);
}

process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
void main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
