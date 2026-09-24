'use strict';

const policy = require('./reflexPolicy');
const subscriptions = require('./reflexSubscriptionService');

function append(session, input) {
  const signal = policy.normalize(input, session.sessionId);
  const existing = session.reflexSignals.find((item) => item.signalId === signal.signalId);
  if (existing) return { signal: existing, recipients: subscriptions.recipients(existing, session.domains), duplicate: true };
  session.reflexSignals.push(signal);
  return { signal, recipients: subscriptions.recipients(signal, session.domains), duplicate: false };
}

function snapshot(session, domainId) {
  const signals = domainId
    ? session.reflexSignals.filter((signal) => subscriptions.recipients(signal, session.domains).includes(domainId))
    : session.reflexSignals;
  return { channel: 'REFLEX', signals };
}

module.exports = { append, snapshot };
