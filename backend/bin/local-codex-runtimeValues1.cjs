'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.mission.prompt || __genosValueScope1.mission.currentTask || 'No prompt provided';
}

module.exports = { mainValue1 };
