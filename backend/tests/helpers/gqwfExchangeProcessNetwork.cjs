'use strict';

const path = require('node:path');
const { startNode } = require('./gqwfExchangeProcessClient.cjs');
const fixture = require('./gqwfExchangeProcessFixtures.cjs');

async function network(directory) {
  const places = { producer: path.join(directory, 'producer'), receiver: path.join(directory, 'receiver') };
  Object.values(places).forEach(fixture.prepare);
  const nodes = {};
  const launch = role => startNode({ role, directory: places[role] });
  const stop = () => Promise.all(Object.values(nodes).map(node => node.stop()));
  try {
    nodes.producer = await launch('producer');
    nodes.receiver = await launch('receiver');
  } catch (error) { await stop(); throw error; }
  return { nodes, places, stop,
    async restartReceiver() { await nodes.receiver.stop(); nodes.receiver = await launch('receiver'); },
  };
}

module.exports = { network };
