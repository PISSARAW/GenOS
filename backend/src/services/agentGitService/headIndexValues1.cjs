'use strict';

function statusValue1(__genosValueScope1) {
  return {
    success: true,
    operation: 'status',
    agentId: __genosValueScope1.agentId,
    head: __genosValueScope1.head?.object_id || null,
    staged: __genosValueScope1.stagedSections.map(section => ({ section,
      count: __genosValueScope1.Array.isArray(__genosValueScope1.indexData.sections[section]) ? __genosValueScope1.indexData.sections[section].length : 1 })),
    stagedCount: __genosValueScope1.stagedCount,
    unstagedSections: __genosValueScope1.unstaged,
    indexBaseMoved: !!__genosValueScope1.index && ((__genosValueScope1.ref?.object_id || null) !== __genosValueScope1.indexData.baseObjectId
      || (0, __genosValueScope1.Number)(__genosValueScope1.ref?.version || 0) !== __genosValueScope1.indexData.baseRefVersion),
    indexExists: !!__genosValueScope1.index
  };
}

module.exports = { statusValue1 };
