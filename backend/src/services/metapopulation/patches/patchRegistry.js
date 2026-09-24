'use strict';
const store = require('../metapopulationStore');
async function create(db, sessionId, patch) { return store.createPatch(db, sessionId, patch); }
async function get(db, sessionId, patchId) { return store.getPatch(db, sessionId, patchId); }
async function list(db, sessionId) { return store.listPatches(db, sessionId); }
async function changeStatus(db, input) { return store.transitionPatch(db, { ...input, metapopulationId: input.sessionId }); }
module.exports = { create, get, list, changeStatus };
