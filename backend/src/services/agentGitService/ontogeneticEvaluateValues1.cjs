'use strict';

function validateInputValue1(__genosValueScope1) {
  return !__genosValueScope1.body?.baselineObjectId || !__genosValueScope1.body?.candidateObjectId || !__genosValueScope1.Array.isArray(__genosValueScope1.names)
    || !__genosValueScope1.names.length || __genosValueScope1.names.length > 8 || new __genosValueScope1.Set(__genosValueScope1.names).size !== __genosValueScope1.names.length
    || __genosValueScope1.names.some((name) => typeof name !== 'string');
}

module.exports = { validateInputValue1 };
