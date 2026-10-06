'use strict';

function workerId(worker) {
  const id = worker.id || worker.individualId;
  if (typeof id !== 'string' || !id) throw new Error('Structural worker requires an identity');
  return id;
}

function distributeWorkers(target, children) {
  const originals = new Map((target.workers || []).map(worker => [workerId(worker), worker]));
  const assigned = new Set();
  for (const child of children) {
    child.workers = (child.workers || []).map(worker => {
      const id = workerId(worker);
      if (assigned.has(id)) throw new Error('Duplicate worker in split population');
      assigned.add(id);
      return structuredClone({ ...originals.get(id), ...worker });
    });
  }
  let cursor = 0;
  for (const [id, worker] of originals) {
    if (assigned.has(id)) continue;
    children[cursor++ % children.length].workers.push(structuredClone(worker));
  }
  target.workers = [];
}

function mergedWorkers(sources) {
  const workers = sources.flatMap(source => source.workers || []);
  const ids = workers.map(workerId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate worker in merged population');
  return structuredClone(workers);
}

module.exports = { distributeWorkers, mergedWorkers };
