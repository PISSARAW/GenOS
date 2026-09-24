'use strict';

function recipients(signal, domains) {
  return Object.values(domains || {}).filter((domain) => subscribes(domain, signal))
    .map((domain) => domain.domainId).sort();
}

function subscribes(domain, signal) {
  const interests = [...domain.mayVeto, ...domain.subscriptions];
  return interests.includes('*') || interests.includes('reflex.*')
    || interests.includes(signal.type) || interests.includes(`reflex.${signal.type.toLowerCase()}`);
}

module.exports = { recipients };
