'use strict';

const { buildAllocation } = require('./tokenAllocationService');

function affordableWorkerCount(tokenPolicy, workerShare) {
  return Math.floor((tokenPolicy.total * workerShare) / tokenPolicy.minimumWorkerTokens);
}

function buildRoundAllocation(tokenPolicy, workerShare, workerCount) {
  return buildAllocation({
    totalTokens: tokenPolicy.total,
    workerShare,
    workerCount,
    minimumWorkerTokens: tokenPolicy.minimumWorkerTokens,
    mode: tokenPolicy.allocation
  });
}

module.exports = { affordableWorkerCount, buildRoundAllocation };
