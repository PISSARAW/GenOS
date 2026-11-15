'use strict';

function main(context) {
  return context.observed.algorithmCount === context.expected.algorithmCount && context.uniqueTopologies === context.ORGANIZATIONS.length && context.behaviorKeys >= 8 && context.Object.values(context.outputShapes).every(context.Boolean);
}

module.exports = { main };
