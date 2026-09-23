'use strict';

function routeKnowledge(input) {
  const holders = Array.isArray((input || {}).holders) ? input.holders : [];
  const needers = Array.isArray((input || {}).needers) ? input.needers : [];
  const knowledge = String((input || {}).knowledge || '');
  const routes = [];
  for (const needer of needers) {
    const holder = holders.find((entry) => entry !== needer) || null;
    if (holder) routes.push({ from: holder, to: needer, knowledge, mode: 'targeted' });
  }
  return { routes, broadcast: false };
}

function shouldBroadcast(input) {
  const urgency = Number((input || {}).urgency || 0);
  const needers = Array.isArray((input || {}).needers) ? input.needers.length : 0;
  return urgency > 0.85 && needers > 5;
}

module.exports = {
  routeKnowledge,
  shouldBroadcast
};
