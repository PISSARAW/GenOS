'use strict';

function stageValue1(__genosValueScope1) {
  return __genosValueScope1.state[__genosValueScope1.section] || (__genosValueScope1.section === 'agent' ? __genosValueScope1.state.agent : []);
}

module.exports = { stageValue1 };
