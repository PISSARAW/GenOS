'use strict';

const { normalizeCapabilityNeed } = require('../contracts/capabilityNeed');

function register(session, value) {
  const need = normalizeCapabilityNeed(value);
  const known = session.activeNeeds.find(item => item.needId === need.needId);
  if (known && JSON.stringify(normalizeCapabilityNeed(known)) !== JSON.stringify(need)) {
    throw Object.assign(new Error('Need contract changed for an existing identifier.'), { code: 'RHIZOME_RUNTIME_NEED_CONFLICT' });
  }
  if (!known) session.activeNeeds.push(need);
  return { need, registered: !known };
}

module.exports = { register };
