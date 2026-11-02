'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { startNode } = require('./synapseProcessClient.cjs');

async function network(directory) {
  const nodes = {};
  const places = Object.fromEntries(['source', 'receiver-a', 'receiver-b'].map(role => [role, path.join(directory, role)]));
  Object.values(places).forEach(place => fs.mkdirSync(place));
  const launch = role => startNode({ role, directory: places[role] });
  const stop = () => Promise.all(Object.values(nodes).map(node => node.stop()));
  try {
    for (const role of Object.keys(places)) nodes[role] = await launch(role);
  } catch (error) { await stop(); throw error; }
  return { nodes, places, stop,
    async restart(role) { await nodes[role].stop(); nodes[role] = await launch(role); },
  };
}

module.exports = { network };
