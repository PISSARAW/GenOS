'use strict';

function main(context) {
  return context.mission.prompt || context.mission.currentTask || 'No prompt provided';
}

module.exports = { main };
