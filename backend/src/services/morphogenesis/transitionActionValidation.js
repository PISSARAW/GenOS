'use strict';

function validateAction(action, index) {
  const errors = [];
  if (!action.type) errors.push(`actions[${index}].type is required`);
  if (!['spawn', 'retire', 'rebind'].includes(action.type)) {
    errors.push(`actions[${index}].type invalid: ${action.type}`);
  }
  if (action.continueOnFailure === true) errors.push(`actions[${index}].continueOnFailure is unsafe`);
  if (['retire', 'rebind'].includes(action.type) && !action.agentId) {
    errors.push(`actions[${index}].agentId is required`);
  }
  return errors;
}

module.exports = { validateAction };
