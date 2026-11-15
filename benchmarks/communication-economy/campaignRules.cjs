'use strict';

function assertMatched(context) {
  return context.trial.model !== context.reference.model || context.trial.provider !== context.reference.provider
        || context.JSON.stringify(context.taskIds(context.trial)) !== context.JSON.stringify(context.taskIds(context.reference));
}

module.exports = { assertMatched };
