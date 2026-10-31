'use strict';

async function importEntryStage1(__genosStageScope1) {
for (const parentId of __genosStageScope1.object.parent_commit_ids || []) {
    if (!await __genosStageScope1.db.get('SELECT id FROM agent_git_objects WHERE id = ?', parentId)) {
      throw new __genosStageScope1.Error(`Remote history is missing parent ${parentId}.`);
    }
  }
}

function exportHistoryStage2(__genosStageScope2) {
if ((0, __genosStageScope2.verifySource)(__genosStageScope2.row).length || (0, __genosStageScope2.commitHash)({ tree: (0, __genosStageScope2.treeHash)(__genosStageScope2.state), parents: __genosStageScope2.row.parentIds, metadata: __genosStageScope2.metadata }) !== __genosStageScope2.row.commit_hash) {
      throw new __genosStageScope2.Error('Remote history failed integrity verification.');
    }
}

module.exports = { importEntryStage1, exportHistoryStage2 };
