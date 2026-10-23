'use strict';

function shouldUpdateAgentTerminalStatus(mission) {
  return mission?.deferAgentTerminalStatus !== true;
}

module.exports = { shouldUpdateAgentTerminalStatus };