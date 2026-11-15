'use strict';

function validateInput(context) {
  return !context.body?.baselineObjectId || !context.body?.candidateObjectId || !context.Array.isArray(context.names)
    || !context.names.length || context.names.length > 8 || new context.Set(context.names).size !== context.names.length
    || context.names.some((name) => typeof name !== 'string');
}

module.exports = { validateInput };
