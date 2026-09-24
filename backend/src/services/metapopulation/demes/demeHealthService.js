'use strict';
function assessHealth(deme) {
  if (!deme) throw Object.assign(new Error('Deme is required.'), { code: 'METAPOPULATION_DEME_INVALID' });
  const members = Array.isArray(deme.members) ? deme.members.length : 0;
  if (deme.status === 'QUARANTINED') return { health: 'QUARANTINED', viable: false, members };
  if (deme.status === 'COLLAPSED') return { health: 'COLLAPSED', viable: false, members };
  if (members === 0) return { health: 'UNKNOWN', viable: null, members };
  if (['AT_RISK', 'STRESSED'].includes(deme.status)) return { health: deme.status, viable: true, members };
  return { health: 'HEALTHY', viable: true, members };
}
module.exports = { assessHealth };