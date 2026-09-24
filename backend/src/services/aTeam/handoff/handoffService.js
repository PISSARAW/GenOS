'use strict';

const { validateDelivery } = require('./handoffValidationService');
const { responseTransition } = require('./receptorService');

function validate(handoff) {
  return validateDelivery(handoff);
}

function respond(handoff, response) {
  return responseTransition(handoff, response);
}

function consumerMayStart(handoffs) {
  return (Array.isArray(handoffs) ? handoffs : []).every((handoff) => handoff.blocking === false || handoff.accepted === true);
}

module.exports = { validate, respond, consumerMayStart };
