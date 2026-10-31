'use strict';

function preValidateToolStage1(__genosStageScope1) {
if (__genosStageScope1.steric) __genosStageScope1.context.docking = __genosStageScope1.steric.docking || { mode: __genosStageScope1.steric.mode };
}

module.exports = { preValidateToolStage1 };
