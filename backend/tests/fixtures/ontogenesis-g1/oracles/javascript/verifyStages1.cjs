'use strict';

function mainStage1(__genosStageScope1) {
for (const term of ['average', 'percentile', 'summary', 'median', 'filter_above', 'empty']) {
        __genosStageScope1.assert.ok(__genosStageScope1.readme.includes(term));
      }
}

module.exports = { mainStage1 };
