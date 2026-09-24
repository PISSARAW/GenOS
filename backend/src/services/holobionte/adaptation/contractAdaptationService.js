'use strict';

const contracts = require('../contracts/symbiosisContractService');

async function adaptContract(db, input = {}) {
  return contracts.adaptContract(db, input);
}

module.exports = { adaptContract };
