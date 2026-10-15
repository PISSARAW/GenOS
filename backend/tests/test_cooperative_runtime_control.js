'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const operator = require('../src/services/operatorRuntimeControl');
const checkpointControl = require('../src/services/cellThreadCheckpointRuntimeControl');
const missionControl = require('../src/services/agentRuntimeAdapter/missionControl');
const { activeProcesses, cancelledStarts } =
  require('../src/services/agentOrchestrationState');

process.env.GENOS_OPERATOR_CONTROL_TIMEOUT_MS = '250';

const identity = Object.freeze({
  workerId: 'worker-a', missionId: 'mission-a', episodeId: 'episode-a',
  threadId: 'thread-a', organizationId: 'org-a', projectId: 'project-a'
});

function target(overrides = {}) {
  return {
    worker_id: 'worker-a', mission_id: 'mission-a', episode_id: 'episode-a',
    thread_id: 'thread-a', organization_id: 'org-a', project_id: 'project-a',
    ...overrides
  };
}

function checkpoint(overrides = {}) {
  return {
    workerId: 'worker-a', missionId: 'mission-a', episodeId: 'episode-a',
    threadId: 'thread-a', organizationId: 'org-a', projectId: 'project-a',
    checkpointId: 'checkpoint-a', checkpointHash: 'sha256:checkpoint',
    contextHash: 'sha256:context', context: { cursor: 7, phase: 'prepared' },
    contextSize: 31, evidenceRefs: ['evidence:a'], ...overrides
  };
}

function acknowledgement(message, overrides = {}) {
  return {
    type: 'genos-runtime-control-ack', requestId: message.requestId,
    action: message.action, lineage: { ...message.lineage },
    ...(message.checkpoint ? { checkpoint: {
      checkpointId: message.checkpoint.checkpointId,
      checkpointHash: message.checkpoint.checkpointHash,
      contextHash: message.checkpoint.contextHash
    } } : {}),
    proven: true, success: true, proofCode: 'CHILD_ACK_EXACT',
    detail: 'cooperative child applied control', ...overrides
  };
}

class FakeChild extends EventEmitter {
  constructor(responder, childIdentity = identity) {
    super();
    this.connected = true;
    this.exitCode = null;
    this.signalCode = null;
    this.genosControlIdentity = childIdentity;
    this.responder = responder;
    this.sent = [];
  }

  send(message, callback) {
    this.sent.push(message);
    if (this.responder) this.responder(message, this);
    if (callback) callback(null);
    return true;
  }
}

function exactChild() {
  return new FakeChild((message, child) => {
    setImmediate(() => child.emit('message', acknowledgement(message, {
      detail: 'secret-child-output', injected: { token: 'secret-injected-field' }
    })));
  });
}

function install(child) {
  activeProcesses.set(identity.workerId, child);
  return () => {
    activeProcesses.delete(identity.workerId);
    cancelledStarts.delete(identity.workerId);
  };
}

test('pause and resume require exact correlated cooperative acknowledgements', async () => {
  const child = exactChild();
  const cleanup = install(child);
  try {
    const paused = await operator.apply({ action: 'pause', target: target() });
    const resumed = await operator.apply({ action: 'resume', target: target() });
    assert.equal(paused.proven, true);
    assert.equal(resumed.proven, true);
    assert.equal(paused.detail,
      'Runtime acknowledged the exact cooperative control request.');
    assert.doesNotMatch(JSON.stringify(paused), /secret-child-output|secret-injected-field/);
    assert.deepEqual(child.sent.map(item => item.action), ['pause', 'resume']);
    for (const message of child.sent) {
      assert.equal(message.type, 'genos-runtime-control-request');
      assert.equal(typeof message.requestId, 'string');
      assert.deepEqual(message.lineage, identity);
      assert.ok(message.timeoutMs >= 25 && message.timeoutMs <= 10000);
    }
    assert.deepEqual(['message', 'close', 'disconnect'].map(name => child.listenerCount(name)),
      [0, 0, 0]);
  } finally { cleanup(); }
});

test('concurrent request ids cannot consume each other acknowledgements', async () => {
  const pending = [];
  const child = new FakeChild((message, source) => {
    pending.push(message);
    if (pending.length !== 2) return;
    setImmediate(() => {
      source.emit('message', acknowledgement(pending[1]));
      source.emit('message', acknowledgement(pending[0]));
    });
  });
  const cleanup = install(child);
  try {
    const [paused, resumed] = await Promise.all([
      operator.apply({ action: 'pause', target: target() }),
      operator.apply({ action: 'resume', target: target() })
    ]);
    assert.equal(paused.proven, true);
    assert.equal(resumed.proven, true);
    assert.notEqual(pending[0].requestId, pending[1].requestId);
  } finally { cleanup(); }
});

test('missing acknowledgement and unavailable IPC fail closed', async () => {
  const silent = new FakeChild();
  let cleanup = install(silent);
  try {
    const timedOut = await operator.apply({ action: 'pause', target: target() });
    assert.deepEqual({ proven: timedOut.proven, code: timedOut.code },
      { proven: false, code: 'RUNTIME_ACK_TIMEOUT' });
    assert.deepEqual(['message', 'close', 'disconnect'].map(name => silent.listenerCount(name)),
      [0, 0, 0]);
  } finally { cleanup(); }

  const disconnected = exactChild();
  disconnected.connected = false;
  cleanup = install(disconnected);
  try {
    const unavailable = await operator.apply({ action: 'resume', target: target() });
    assert.deepEqual({ proven: unavailable.proven, code: unavailable.code },
      { proven: false, code: 'RUNTIME_IPC_UNAVAILABLE' });
  } finally { cleanup(); }
});

test('send errors and IPC closure fail closed without leaking listeners', async () => {
  const sendError = exactChild();
  sendError.send = (_message, callback) => callback(new Error('channel rejected'));
  let cleanup = install(sendError);
  try {
    const failed = await operator.apply({ action: 'pause', target: target() });
    assert.equal(failed.code, 'RUNTIME_SEND_FAILED');
    assert.deepEqual(['message', 'close', 'disconnect'].map(name => sendError.listenerCount(name)),
      [0, 0, 0]);
  } finally { cleanup(); }

  const closed = new FakeChild((_message, source) => {
    setImmediate(() => source.emit('disconnect'));
  });
  cleanup = install(closed);
  try {
    const failed = await operator.apply({ action: 'resume', target: target() });
    assert.equal(failed.code, 'RUNTIME_IPC_CLOSED');
    assert.deepEqual(['message', 'close', 'disconnect'].map(name => closed.listenerCount(name)),
      [0, 0, 0]);
  } finally { cleanup(); }
});

test('identity and acknowledgement lineage divergence fail closed', async () => {
  const wrongIdentity = { ...identity, organizationId: 'org-b' };
  let cleanup = install(new FakeChild(null, wrongIdentity));
  try {
    const refused = await operator.apply({ action: 'pause', target: target() });
    assert.equal(refused.code, 'RUNTIME_IDENTITY_UNPROVEN');
  } finally { cleanup(); }

  const child = new FakeChild((message, source) => setImmediate(() => {
    source.emit('message', acknowledgement(message, {
      lineage: { ...message.lineage, organizationId: 'org-b' }
    }));
  }));
  cleanup = install(child);
  try {
    const divergent = await operator.apply({ action: 'pause', target: target() });
    assert.deepEqual({ proven: divergent.proven, code: divergent.code },
      { proven: false, code: 'RUNTIME_ACK_DIVERGENT' });
  } finally { cleanup(); }
});

test('unsafe proof codes are rejected without reflecting child content', async () => {
  const child = new FakeChild((message, source) => setImmediate(() => {
    source.emit('message', acknowledgement(message, {
      proofCode: 'SECRET secret child payload'
    }));
  }));
  const cleanup = install(child);
  try {
    const refused = await operator.apply({ action: 'pause', target: target() });
    assert.equal(refused.code, 'RUNTIME_ACK_DIVERGENT');
    assert.doesNotMatch(JSON.stringify(refused), /secret child payload/i);
  } finally { cleanup(); }
});

test('checkpoint resume returns the exact proof expected by the checkpoint service', async () => {
  const child = exactChild();
  const cleanup = install(child);
  try {
    const request = checkpoint();
    const proof = await checkpointControl.resume(request);
    assert.equal(proof.proven, true);
    assert.equal(proof.proofCode, 'CHILD_ACK_EXACT');
    for (const field of ['checkpointId', 'checkpointHash', 'contextHash',
      'workerId', 'missionId', 'episodeId', 'threadId', 'organizationId', 'projectId']) {
      assert.equal(proof[field], request[field]);
    }
    assert.equal(child.sent[0].action, 'resume_checkpoint');
    assert.deepEqual(child.sent[0].checkpoint, {
      checkpointId: request.checkpointId, checkpointHash: request.checkpointHash,
      contextHash: request.contextHash, context: request.context,
      contextSize: request.contextSize, evidenceRefs: request.evidenceRefs
    });
  } finally { cleanup(); }
});

test('checkpoint hash divergence cannot prove resume', async () => {
  const child = new FakeChild((message, source) => setImmediate(() => {
    source.emit('message', acknowledgement(message, {
      checkpoint: { ...message.checkpoint, checkpointHash: 'sha256:other' }
    }));
  }));
  const cleanup = install(child);
  try {
    const proof = await checkpointControl.resume(checkpoint());
    assert.deepEqual({ proven: proof.proven, code: proof.code },
      { proven: false, code: 'RUNTIME_ACK_DIVERGENT' });
  } finally { cleanup(); }
});

test('cancel needs a cooperative ACK and an observed close', async () => {
  const child = exactChild();
  const cleanup = install(child);
  const original = missionControl.stopMission;
  missionControl.stopMission = async workerId => {
    assert.equal(workerId, identity.workerId);
    setImmediate(() => child.emit('close', 0, null));
    return true;
  };
  try {
    const result = await operator.apply({ action: 'cancel', target: target() });
    assert.deepEqual({ proven: result.proven, code: result.code },
      { proven: true, code: 'RUNTIME_STOP_CONFIRMED' });
    assert.equal(child.sent[0].action, 'cancel');
  } finally {
    missionControl.stopMission = original;
    cleanup();
  }
});

test('cancel timeout removes its close listener and remains unproven', async () => {
  const child = exactChild();
  const cleanup = install(child);
  const original = missionControl.stopMission;
  missionControl.stopMission = async () => true;
  try {
    const result = await operator.apply({ action: 'cancel', target: target() });
    assert.deepEqual({ proven: result.proven, code: result.code },
      { proven: false, code: 'RUNTIME_STOP_UNCONFIRMED' });
    assert.equal(child.listenerCount('close'), 0);
  } finally {
    missionControl.stopMission = original;
    cleanup();
  }
});
