'use strict';

const control = require('../../src/services/localRuntimeCooperativeControl');
const reconnectBootstrap = require('../../src/services/localRuntimeReconnectBootstrap');

const input = JSON.parse(Buffer.from(process.env.GENOS_RECOVERED_RUNTIME, 'base64url').toString());
const state = { mission: input.lineage, framedPrompt: 'recovered supervision fixture' };
let runtime;

function reply(message) { process.send?.(message); }

async function main() {
  if (!control.bind(state)) throw new Error('Runtime control binding failed.');
  runtime = await reconnectBootstrap.start({
    lineage: input.lineage, backendPublicKey: input.backendPublicKey,
    persistDescriptor: descriptor => reply({ type: 'descriptor', descriptor })
  });
  process.on('message', message => {
    if (message?.type === 'publish') {
      reply({ type: 'publish-result', id: message.id,
        sent: runtime.supervision.publish(message.kind, message.payload) });
    }
    if (message?.type === 'shutdown') void shutdown();
  });
}

async function shutdown() {
  await runtime?.close();
  process.exit(0);
}

process.once('SIGTERM', () => { void shutdown(); });
void main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
