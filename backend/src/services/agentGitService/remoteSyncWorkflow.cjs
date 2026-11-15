'use strict';

async function importHistoryEntry(context) {
for (const parentId of context.object.parent_commit_ids || []) {
    if (!await context.db.get('SELECT id FROM agent_git_objects WHERE id = ?', parentId)) {
      throw new context.Error(`Remote history is missing parent ${parentId}.`);
    }
  }
}

function exportHistory(context) {
if (context.verifySource(context.row).length || context.commitHash({ tree: context.treeHash(context.state), parents: context.row.parentIds, metadata: context.metadata }) !== context.row.commit_hash) {
      throw new context.Error('Remote history failed integrity verification.');
    }
}

module.exports = { importHistoryEntry, exportHistory };
