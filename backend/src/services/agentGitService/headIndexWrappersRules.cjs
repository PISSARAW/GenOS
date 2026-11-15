'use strict';

function stage(context) {
  return context.state[context.section] || (context.section === 'agent' ? context.state.agent : []);
}

module.exports = { stage };
