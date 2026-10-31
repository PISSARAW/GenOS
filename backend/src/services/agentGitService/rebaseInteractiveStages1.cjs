'use strict';

async function loadPlanStage1(__genosStageScope1) {
for (const [index, object] of __genosStageScope1.commits.entries()) {
    const graph = await (0, __genosStageScope1.getCommit)(__genosStageScope1.db, object.id);
    if (graph?.parentIds?.[0] !== (index ? __genosStageScope1.ids[index - 1] : __genosStageScope1.parentId)) {
      throw new __genosStageScope1.Error('Interactive rebase commits must form a contiguous first-parent chain.');
    }
  }
}

module.exports = { loadPlanStage1 };
