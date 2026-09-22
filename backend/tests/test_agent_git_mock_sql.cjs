'use strict';

function createStore() {
  return { indexes: {}, refs: {}, parents: {}, decisions: {}, objects: {} };
}

function getAgent(args) {
  return args[0] ? { id: args[0] } : null;
}

function getIndex(store, args) {
  return store.indexes[args[0]] || null;
}

function getObject(store, args) {
  const id = args[0];
  return store.objects[id] || Object.values(store.objects)[0] || null;
}

function getRef(store, sql, args) {
  if (sql.includes('object_id')) return { object_id: store.refs[`${args[0]}:${args[1]}`] || null };
  return store.refs[`${args[0]}:${args[1]}`] || null;
}

function handleGet(store, sql, args) {
  if (sql.includes('FROM agents')) return getAgent(args);
  if (sql.includes('agent_git_indexes')) return getIndex(store, args);
  if (sql.includes('agent_git_objects')) return getObject(store, args);
  if (sql.includes('agent_git_refs')) return getRef(store, sql, args);
  return null;
}

function handleAll(store, sql) {
  if (sql.includes('agent_git_objects')) return Object.values(store.objects);
  if (sql.includes('agent_git_commit_parents')) return [];
  return [];
}

function insertIndex(store, args) {
  store.indexes[args[1]] = { id: args[0], agent_id: args[1], index_json: args[2] };
}

function updateIndex(store, args) {
  if (store.indexes[args[1]]) store.indexes[args[1]].index_json = args[0];
}

function deleteIndex(store, args) {
  delete store.indexes[args[0]];
}

function insertRef(store, args) {
  store.refs[`${args[1]}:${args[2]}`] = { ref_key: args[0], agent_id: args[1], ref_name: args[2], object_id: args[3], version: args[4] };
}

function updateRef(store, args) {
  const key = `${args[1]}:${args[2]}`;
  if (store.refs[key]) store.refs[key].object_id = args[0];
}

function insertParent(store, args) {
  store.parents[args[0]] = store.parents[args[0]] || [];
  if (!store.parents[args[0]].includes(args[1])) store.parents[args[0]].push(args[1]);
}

function insertObject(store, args) {
  store.objects[args[0]] = { id: args[0], agent_id: args[1], workspace_id: args[2], object_kind: args[3], ref_name: args[4], remote_name: args[5], state_hash: args[6], state_json: args[7], metadata_json: args[8], signature: args[9], created_by: args[10], parent_commit_id: args[11] || null };
}

function handleRun(store, sql, args) {
  if (sql.includes('INSERT INTO agent_git_indexes')) { insertIndex(store, args); return { changes: 1 }; }
  if (sql.includes('UPDATE agent_git_indexes')) { updateIndex(store, args); return { changes: 1 }; }
  if (sql.includes('DELETE FROM agent_git_indexes')) { deleteIndex(store, args); return { changes: 1 }; }
  if (sql.includes('INSERT INTO agent_git_refs')) { insertRef(store, args); return { changes: 1 }; }
  if (sql.includes('UPDATE agent_git_refs')) { updateRef(store, args); return { changes: 1 }; }
  if (sql.includes('INSERT INTO agent_git_commit_parents')) { insertParent(store, args); return { changes: 1 }; }
  if (sql.includes('INSERT INTO agent_git_objects')) { insertObject(store, args); return { changes: 1 }; }
  return { changes: 1 };
}

module.exports = { createStore, handleGet, handleAll, handleRun };
