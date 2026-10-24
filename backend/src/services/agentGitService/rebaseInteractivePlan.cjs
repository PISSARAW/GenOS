'use strict';

const { computePatch, applyOperationToState } = require('./dagOperations');
const { identityOf } = require('./sectionIdentity.cjs');
const { checkOutcomeInvariants } = require('./causalOps.cjs');

const ACTIONS = new Set(['pick', 'drop', 'reword', 'squash', 'fixup', 'edit']);
const EDITABLE = new Set(['decisions', 'memories']);

function validateActions(ids, actions) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 64 || new Set(ids).size !== ids.length
    || !Array.isArray(actions) || actions.length !== ids.length) {
    throw new Error('A unique ordered series of 1 to 64 commits and one action per commit is required.');
  }
  actions.forEach((item, index) => {
    if (!ACTIONS.has(item?.action)) throw new Error(`Unsupported action at ${index}.`);
    if (['squash', 'fixup'].includes(item.action) && index === 0) throw new Error('First action cannot squash or fixup.');
    if (item.action === 'edit' && (!item.state || typeof item.state !== 'object')) {
      throw new Error(`Edit action ${index} requires a state.`);
    }
  });
}

function validateEditedState(original, edited) {
  for (const key of new Set([...Object.keys(original), ...Object.keys(edited)])) {
    if (!EDITABLE.has(key) && JSON.stringify(original[key]) !== JSON.stringify(edited[key])) {
      throw new Error(`Interactive edit cannot change ${key}.`);
    }
  }
}

function findItem(state, section, id) {
  return (state[section] || []).find((item) => identityOf(section, item) === id);
}

function applyCheckedPatch(current, previous, next) {
  const patch = computePatch(previous, next);
  const state = structuredClone(current);
  for (const operation of patch.operations) {
    const id = operation.itemId ?? identityOf(operation.section, operation.item);
    const old = findItem(previous, operation.section, id);
    const observed = findItem(state, operation.section, id);
    const desired = operation.op === 'REMOVE' ? undefined : operation.item;
    if (JSON.stringify(observed) !== JSON.stringify(old)
      && JSON.stringify(observed) !== JSON.stringify(desired)) {
      throw new Error(`Rebase conflict in ${operation.section}/${id}.`);
    }
    if (operation.op === 'ADD' && observed) continue;
    applyOperationToState(state, operation);
  }
  const bad = Object.entries(checkOutcomeInvariants(state)).filter(([, valid]) => valid === false);
  if (bad.length) throw new Error(`Rebased state violates ${bad[0][0]}.`);
  return state;
}

function planReplay(ontoState, commits, actions, parentState) {
  let current = structuredClone(ontoState);
  let previous = parentState;
  const planned = [];
  let pending = null;
  const flush = () => { if (pending) planned.push(pending); pending = null; };
  commits.forEach((commit, index) => {
    const original = JSON.parse(commit.state_json);
    const action = actions[index];
    if (action.action !== 'drop') {
      if (action.action === 'edit') validateEditedState(original, action.state);
      current = applyCheckedPatch(current, previous, action.action === 'edit' ? action.state : original);
      const message = action.message || JSON.parse(commit.metadata_json || '{}').message || commit.id;
      if (['squash', 'fixup'].includes(action.action)) {
        if (!pending) throw new Error('Squash or fixup requires a preceding kept commit.');
        pending.state = structuredClone(current);
        pending.sources.push(commit.id);
        if (action.action === 'squash') pending.message += `\n${message}`;
      } else {
        flush();
        pending = { state: structuredClone(current), sources: [commit.id], message };
      }
    }
    previous = original;
  });
  flush();
  return { planned, finalState: current };
}

module.exports = { validateActions, validateEditedState, applyCheckedPatch, planReplay };
