'use strict';

const sessionStore = require('../../topologySessionStore');
const { assertValid } = require('./workGraphCompiler');

const TOPOLOGY = 'a_team_work_graph';

async function create(db, graph) {
  assertValid(graph);
  const saved = await sessionStore.save(db, { id: graph.workGraphId, topology: TOPOLOGY, state: graph });
  return { ...graph, revision: saved.revision };
}

async function load(db, workGraphId) {
  const stored = await sessionStore.load(db, workGraphId);
  if (!stored || stored.topology !== TOPOLOGY) return null;
  assertValid(stored.state);
  return { ...stored.state, revision: stored.revision };
}

async function update(options = {}) {
  const { db, workGraphId, revision, graph } = options;
  if (!Number.isInteger(revision) || revision < 0) {
    throw Object.assign(new Error('WorkGraph updates require the current revision.'), { code: 'ATEAM_WORK_GRAPH_REVISION_REQUIRED' });
  }
  if (!graph || graph.workGraphId !== workGraphId) throw Object.assign(new Error('WorkGraph identity cannot change during update.'), { code: 'ATEAM_WORK_GRAPH_INVALID' });
  assertValid(graph);
  const saved = await sessionStore.save(db, { id: workGraphId, topology: TOPOLOGY, state: graph, revision });
  return { ...graph, revision: saved.revision };
}

module.exports = { TOPOLOGY, create, load, update };
