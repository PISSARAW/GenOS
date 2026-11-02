'use strict';

const path = require('node:path');
const { startNode } = require('./omegaProcessClient.cjs');
const fixture = require('./omegaProcessFixtures.cjs');

async function network(directory) {
  const nodes = {};
  let resourceOnline = true;
  const roles = ['resource', 'executor', 'client'];
  const places = Object.fromEntries(roles.map(role => [role, path.join(directory, role)]));
  Object.values(places).forEach(fixture.prepare);
  function route(role, message) {
    if (role === 'client' && message.peer === 'executor' && message.action === 'envelope') {
      return nodes.executor.request(message.action, message.value, fixture.CLIENT);
    }
    if (role === 'executor' && message.peer === 'resource' && ['execute', 'reconcile'].includes(message.action)) {
      if (!resourceOnline) throw new Error('OMEGA resource transport unavailable.');
      return nodes.resource.request(message.action, message.value, fixture.EXECUTOR);
    }
    throw new Error('OMEGA IPC route denied.');
  }
  const launch = role => startNode({ role, directory: places[role], route: message => route(role, message) });
  const stop = () => Promise.all(Object.values(nodes).map(node => node.stop()));
  try {
    for (const role of roles) nodes[role] = await launch(role);
    await nodes.resource.request('bootstrap', fixture.bootstrap());
  } catch (error) { await stop(); throw error; }
  return { nodes, places, stop,
    send(message) { return nodes.client.request('send', message); },
    async restartExecutor() { await nodes.executor.stop(); nodes.executor = await launch('executor'); },
    async disconnectResource() { resourceOnline = false; await nodes.resource.stop(); },
    async reconnectResource() { nodes.resource = await launch('resource'); resourceOnline = true; },
  };
}

module.exports = { network };
