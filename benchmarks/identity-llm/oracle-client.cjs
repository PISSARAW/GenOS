'use strict';
const path = require('node:path');
const { fork } = require('node:child_process');
const TIMEOUT_MS = 5000;

class OracleClient {
  constructor(child) {
    this.child = child;
    this.nextId = 0;
    this.failure = null;
    this.pending = null;
    this.closed = false;
    child.on('message', message => this.receive(message));
    child.on('error', error => this.fail(error));
    child.on('exit', (code, signal) => {
      if (!this.closed) this.fail(Error(`PROCESS_EXIT:${code}:${signal}`));
    });
    this.ready = this.wait({ type: 'ready' });
  }

  wait(expected) {
    return new Promise((resolve, reject) => {
      const deadline = performance.now() + TIMEOUT_MS;
      const timer = setTimeout(() => this.fail(Error('ETIMEDOUT')), TIMEOUT_MS);
      this.pending = { expected, resolve, reject, deadline, timer };
    });
  }

  receive(message) {
    const pending = this.pending;
    if (!pending) return this.fail(Error('UNEXPECTED_MESSAGE'));
    if (performance.now() > pending.deadline) return this.fail(Error('ETIMEDOUT'));
    if (message?.type === 'error' && message.id === pending.expected.id) {
      return this.fail(Error('REMOTE:' + message.error));
    }
    if (!validMessage(message, pending.expected)) return this.fail(Error('INVALID_REPLY'));
    clearTimeout(pending.timer);
    this.pending = null;
    pending.resolve(message.result);
  }

  fail(error) {
    if (this.failure) return;
    this.failure = Error('ORACLE_FAILED:' + error.message);
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(this.failure);
      this.pending = null;
    }
    this.child.kill();
  }

  answer(input) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closed) return Promise.reject(Error('ORACLE_CLOSED'));
    if (this.pending) {
      this.fail(Error('CONCURRENT_REQUEST'));
      return Promise.reject(this.failure);
    }
    const id = ++this.nextId;
    const result = this.wait({ type: 'result', id, taskId: input.task.id });
    try {
      this.child.send({ type: 'evaluate', id, input }, error => {
        if (error) this.fail(error);
      });
    } catch (error) { this.fail(error); }
    return result;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.pending) this.fail(Error('CLOSED_DURING_REQUEST'));
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const stopped = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('ORACLE_STOP_TIMEOUT')), TIMEOUT_MS);
      this.child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    this.child.kill();
    await stopped;
  }
}

function validMessage(message, expected) {
  if (!message || message.type !== expected.type) return false;
  if (expected.type === 'ready') return Object.keys(message).length === 1;
  return message.id === expected.id && message.result?.taskId === expected.taskId
    && typeof message.result.solvable === 'boolean'
    && Object.hasOwn(message.result, 'expected');
}

async function create() {
  const child = fork(path.join(__dirname, 'oracle-server.cjs'), [], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  child.stderr.resume();
  const client = new OracleClient(child);
  try { await client.ready; return client; }
  catch (error) { await client.close(); throw error; }
}

module.exports = { create, OracleClient, TIMEOUT_MS };
