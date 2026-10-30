'use strict';

async function mainStage1(__genosStageScope1) {
if (__genosStageScope1.db) await (0, __genosStageScope1.closeDatabase)();
}

module.exports = { mainStage1 };
