'use strict';

async function decideCommunication(context) {
if (context.informed.length === 0 && context.stigmergyEligible(context.intent, context.input)) {
    return { value: ( context.logAndDecide(context.input, await context.decideStigmergy(context.input, context.intent, context.refs))) };
  }
}

module.exports = { decideCommunication };
