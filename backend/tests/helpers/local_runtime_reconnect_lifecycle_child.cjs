'use strict';

const control = require('../../src/services/localRuntimeCooperativeControl');
const lifecycle = require('../../src/services/localRuntimeReconnectLifecycle');

const lineage = JSON.parse(Buffer.from(process.env.GENOS_TEST_LINEAGE, 'base64url').toString());
const state = { mission: { agentId: 'mission-shaped-agent', missionId: 'wrong-mission' },
  framedPrompt: 'runtime lifecycle fixture' };

async function main() {
  lifecycle.configure(state);
  if (!control.bind(state)) throw new Error('Control binding failed.');
  state.reconnectRuntime = await lifecycle.start(state);
  process.send({ type: 'fixture-runtime-reconnect-started',
    descriptor: state.reconnectRuntime?.descriptor || null,
    privateKeyVisible: Boolean(process.env.GENOS_RUNTIME_CONTROL_SIGNING_KEY_FILE),
    lineageMatchesMission: JSON.stringify(lineage) === JSON.stringify(state.mission) });
  process.once('message', async message => {
    if (message?.type !== 'fixture-shutdown') return;
    await lifecycle.close(state);
    process.exit(0);
  });
}

void main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
