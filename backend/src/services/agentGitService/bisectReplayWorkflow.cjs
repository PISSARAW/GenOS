'use strict';

function bisectReplay(context) {
if (!context.baseline.pass || context.terminal.pass) {
    return { value: ( { success: false, error: 'Good checkpoint must pass and bad checkpoint must fail.', probes: context.probes }) };
  }
}

module.exports = { bisectReplay };
