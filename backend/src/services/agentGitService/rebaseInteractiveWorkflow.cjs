'use strict';

async function loadInteractivePlan(context) {
for (const [index, object] of context.commits.entries()) {
    const graph = await context.getCommit(context.db, object.id);
    if (graph?.parentIds?.[0] !== (index ? context.ids[index - 1] : context.parentId)) {
      throw new context.Error('Interactive rebase commits must form a contiguous first-parent chain.');
    }
  }
}

module.exports = { loadInteractivePlan };
