'use strict';

const path = require('node:path');
const { startNode } = require('./morphProcessClient.cjs');
const fixture = require('./morphProcessFixtures.cjs');

function allowedRoute(role, message) {
  if (role === 'coordinator') {
    return fixture.PARTICIPANTS.some(item => item.agentId === message.peer) &&
      ['status', 'readyReceipt', 'receipt'].includes(message.action);
  }
  return message.peer === 'coordinator' && message.action === 'decision';
}

async function network(directory) {
  const nodes = {};
  let decisionGate = null;
  const roles = ['coordinator', ...fixture.PARTICIPANTS.map(item => item.agentId)];
  for (const role of roles) fixture.prepare(path.join(directory, role));
  async function launch(role) {
    const place = path.join(directory, role);
    return startNode({ role, directory: place, route: async message => {
      if (!allowedRoute(role, message)) throw new Error('MORPH IPC route denied.');
      const principal = role === 'coordinator' ? fixture.COORDINATOR : fixture.PARTICIPANTS.find(item => item.agentId === role);
      if (role !== 'coordinator' && decisionGate) {
        decisionGate.enter();
        await decisionGate.wait;
      }
      return nodes[message.peer].request(message.action, message.value, principal);
    } });
  }
  async function start() {
    for (const role of roles) nodes[role] = await launch(role);
  }
  async function stop() { await Promise.all(Object.values(nodes).map(node => node.stop())); }
  try {
    await start();
    for (const role of roles.slice(1)) await nodes[role].request('bootstrap');
  } catch (error) { await stop(); throw error; }
  return { nodes, roles, stop,
    holdDecisions() {
      let enter;
      let release;
      const entered = new Promise(resolve => { enter = resolve; });
      const wait = new Promise(resolve => { release = resolve; });
      decisionGate = { enter, wait };
      return { entered, release() { decisionGate = null; release(); } };
    },
    async restart() { await stop(); await start(); },
    coordinator(action, value, principal = fixture.COORDINATOR) {
      return nodes.coordinator.request(action, value, principal);
    },
    participant(role, action, value, principal = fixture.COORDINATOR) {
      return nodes[role].request(action, value, principal);
    },
    async all(action, value) {
      return Promise.all(roles.slice(1).map(role => nodes[role].request(action, value, fixture.COORDINATOR)));
    },
  };
}

module.exports = { network };
