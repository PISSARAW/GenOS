'use strict';

const events = require('./agent-runtime-events.cjs');

function wireStdio(state) {
  state.child.stdout.on('data', (chunk) => events.handleStdout(state, chunk));
  state.child.stderr.on('data', (chunk) => {
    const detail = chunk.toString();
    state.stderr = `${state.stderr}${detail}`.slice(-4000);
    process.stderr.write(detail);
    if (!state.networkDenied && isPermanentNetworkDenial(state.stderr)) {
      state.networkDenied = true;
      state.stderr = `${state.stderr}\n[GENOS_PERMANENT_NETWORK_DENIAL] WebSocket access was denied by the operating system; retries stopped.`.slice(-4000);
      state.emit({ eventType: 'AGENT_RUNTIME_ERROR', action: 'NETWORK_ACCESS_DENIED', detail: 'The operating system denied the model WebSocket (os error 10013); this run was stopped without retrying.', severity: 'error', status: 'error' });
      state.child.kill();
    }
  });
  state.child.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') process.stderr.write(`Runtime stdin error: ${error.message}\n`);
  });
}

function isPermanentNetworkDenial(stderr) {
  return /os error 10013/i.test(String(stderr || ''))
    && /wss?:\/\//i.test(String(stderr || ''));
}

module.exports = { wireStdio, isPermanentNetworkDenial };
