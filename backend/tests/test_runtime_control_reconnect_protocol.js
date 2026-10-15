'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const reconnectServer = require('../src/services/localRuntimeReconnectServer');
const reconnectClient = require('../src/services/runtimeControlReconnectClient');

const lineage = Object.freeze({ workerId: 'worker-1', missionId: 'mission-1', episodeId: 'episode-1',
  threadId: 'thread-1', organizationId: 'org-1', projectId: 'project-1' });

async function main() {
  const backendKeys = crypto.generateKeyPairSync('ed25519');
  let resolveAttached;
  const attached = new Promise(resolve => { resolveAttached = resolve; });
  const server = await reconnectServer.start({ backendPublicKey: backendKeys.publicKey, lineage,
    onAttach: (channel, descriptor) => {
      channel.send({ type: 'attached', runtimeInstanceId: descriptor.runtimeInstanceId });
      resolveAttached(descriptor);
    } });
  let client;
  try {
    client = await reconnectClient.connect({ descriptor: server.descriptor,
      backendPrivateKey: backendKeys.privateKey });
    const responsePromise = waitForAttachment(client, server.descriptor.runtimeInstanceId);
    client.activate();
    const response = await responsePromise;
    assert.equal(response.runtimeInstanceId, server.descriptor.runtimeInstanceId);
    const descriptor = await attached;
    assert.deepEqual(descriptor.lineage, lineage);
    assert.deepEqual(client.genosControlIdentity, lineage);
    console.log('Runtime reconnect mutual signature proof and activation handshake: PASS');
  } finally {
    client?.destroy();
    await server.close();
  }
}

function waitForAttachment(channel, runtimeInstanceId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Runtime activation timed out.')), 2000);
    channel.once('message', message => {
      clearTimeout(timer);
      try {
        assert.deepEqual(message, { type: 'attached', runtimeInstanceId });
        resolve(message);
      } catch (error) { reject(error); }
    });
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
