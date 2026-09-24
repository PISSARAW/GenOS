'use strict';

function value(input) {
  const { relevance = 0, compatibility = 0, provenUtility = 0, assimilationCost = 0 } = input;
  return Number((relevance * compatibility * provenUtility - assimilationCost).toFixed(4));
}

module.exports = { value };
