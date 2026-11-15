'use strict';

function main(context) {
  return context.JSON.stringify(context.observed) === context.JSON.stringify(context.EXPECTED)
      && context.controlError?.code === 'AGENT_CONTROL_FORBIDDEN' && context.bridgeTest.exitCode === 0;
}

module.exports = { main };
