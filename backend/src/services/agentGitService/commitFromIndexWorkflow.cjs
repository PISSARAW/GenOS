'use strict';

function commitFromIndexStep1(context) {
if (context.parent && context.require('./verifiedMerge.cjs').verifySource(context.parent).length) {
    return { value: ( { success: false, error: 'Staged parent failed integrity verification.' }) };
  }
}

function commitFromIndexStep2(context) {
if (context.data.refName !== context.refName || !context.Number.isSafeInteger(context.data.baseRefVersion)) {
    return { value: ( { success: false, error: 'Index base is missing or belongs to another ref; stage again.' }) };
  }
}

module.exports = { commitFromIndexStep1, commitFromIndexStep2 };
