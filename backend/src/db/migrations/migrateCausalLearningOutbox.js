'use strict';

async function migrateCausalLearningOutbox(db) {
  await require('../../services/causalLearningOutbox').ensure(db);
}

module.exports = { migrateCausalLearningOutbox };
