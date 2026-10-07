'use strict';
// One database/runtime owner; no shell and no caller-supplied executable.
const { fork } = require('child_process');
const path = require('path');
const { terminateChild } = require('../src/services/processTermination');
let child;
let restarting = false;
let stopping = false;
let deadline;

function boot() {
  child = fork(path.resolve(__dirname, '../server.js'), [], {
    windowsHide: true, stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, GENOS_STUDIO_SUPERVISED: '1', GENOS_JOB_WORKER: '1',
      GENOS_SCHEMA_MAINTENANCE: '1', GENOS_RUNTIME_MAINTENANCE: '1', GENOS_CIRCUIT_BREAKER_SHARED: '0' }
  });
  child.on('message', message => {
    if (message?.type !== 'studio:restart' || restarting || stopping) return;
    restarting = true;
    drain();
  });
  child.once('exit', (code, signal) => {
    clearTimeout(deadline);
    if (restarting && code === 0 && !stopping) { restarting = false; boot(); return; }
    process.exitCode = stopping && code === 0 ? 0 : (code || 1);
    console.log('[Studio supervisor] Backend arrêté.', { code, signal });
  });
  child.on('error', error => { console.error('[Studio supervisor]', error.message); stopping = true; });
}

function drain() {
  if (!child?.connected) return;
  child.send({ type: 'studio:shutdown' });
  deadline = setTimeout(() => {
    // A forced stop is a failure, never a successful restart.
    stopping = true;
    terminateChild(child);
  }, 45000);
}

function shutdown() {
  if (stopping) return;
  stopping = true;
  drain();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.on('message', message => { if (message?.type === 'studio:shutdown') shutdown(); });
boot();
