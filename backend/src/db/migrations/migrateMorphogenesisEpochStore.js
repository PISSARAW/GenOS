'use strict';

async function migrateMorphogenesisEpochStore(db) {
  await require('../../services/morphogenesis/morphogenesisEpochStore').ensure(db);
}

module.exports = { migrateMorphogenesisEpochStore };
