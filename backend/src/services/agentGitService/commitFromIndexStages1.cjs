'use strict';

function commitFromIndexStage1(__genosStageScope1) {
if (__genosStageScope1.parent && (0, __genosStageScope1.require)('./verifiedMerge.cjs').verifySource(__genosStageScope1.parent).length) {
    return { value: ( { success: false, error: 'Staged parent failed integrity verification.' }) };
  }
}

function commitFromIndexStage2(__genosStageScope2) {
if (__genosStageScope2.data.refName !== __genosStageScope2.refName || !__genosStageScope2.Number.isSafeInteger(__genosStageScope2.data.baseRefVersion)) {
    return { value: ( { success: false, error: 'Index base is missing or belongs to another ref; stage again.' }) };
  }
}

module.exports = { commitFromIndexStage1, commitFromIndexStage2 };
