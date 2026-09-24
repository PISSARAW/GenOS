'use strict';

function assign(edgeIds, options = {}) {
  const gamma = Number.isFinite(options.gamma) ? options.gamma : 0.8;
  return edgeIds.map((edgeId, index) => {
    const distanceToOutcome = edgeIds.length - index - 1;
    return { edgeId, distanceToOutcome, credit: Number(Math.pow(gamma, distanceToOutcome).toFixed(4)) };
  });
}

module.exports = { assign };
