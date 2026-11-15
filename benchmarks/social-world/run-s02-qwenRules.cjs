'use strict';

function main(context) {
  return context.JSON.stringify(context.canonical(context.observed)) === context.JSON.stringify(context.canonical(context.expected))
      && !context.observed.some((edge) => edge.sourceAgentId === 'agent-a' || edge.targetAgentId === 'agent-a')
      && context.friend.relationType === 'friend'
      && context.after.changes.removed === 1;
}

module.exports = { main };
