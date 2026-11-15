'use strict';

function status(context) {
  return {
    success: true,
    operation: 'status',
    agentId: context.agentId,
    head: context.head?.object_id || null,
    staged: context.stagedSections.map(section => ({ section,
      count: context.Array.isArray(context.indexData.sections[section]) ? context.indexData.sections[section].length : 1 })),
    stagedCount: context.stagedCount,
    unstagedSections: context.unstaged,
    indexBaseMoved: !!context.index && ((context.ref?.object_id || null) !== context.indexData.baseObjectId
      || context.Number(context.ref?.version || 0) !== context.indexData.baseRefVersion),
    indexExists: !!context.index
  };
}

module.exports = { status };
