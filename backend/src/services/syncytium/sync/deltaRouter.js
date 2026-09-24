'use strict';

const subscriptions = require('./subscriptionPlanner');

function route({ operation, schema, domains }) {
  const path = String(operation?.kind?.key || (operation?.kind?.type?.endsWith('_text') ? 'textContent' : '')).trim();
  if (!path) return [];
  return subscriptions.recipients(path, schema, domains);
}

module.exports = { route };
