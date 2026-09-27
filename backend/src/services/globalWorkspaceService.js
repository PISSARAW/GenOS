'use strict';

function admit(contents, capacity = 3) {
  const list = Array.isArray(contents) ? contents : [];
  const limit = Math.max(1, Math.floor(Number(capacity) || 3));
  const ranked = [...list].sort((a, b) => (Number(b.salience) || 0) - (Number(a.salience) || 0));
  return { admitted: ranked.slice(0, limit), evicted: ranked.slice(limit), capacity: limit, overloaded: ranked.length > limit };
}

function compete(contents, options = {}) {
  const workspace = admit(contents, options.capacity);
  const threshold = Number(options.ignitionThreshold) || 1;
  const winner = workspace.admitted.find((item) => Number(item.salience) >= threshold) || null;
  return { ...workspace, winner, ignited: Boolean(winner), globalAccess: winner ? (options.modules || ['memory', 'planning', 'reporting']) : [] };
}

function diffuse(workspace, modules) {
  const target = Array.isArray(modules) ? modules : [];
  const winner = workspace?.winner;
  return target.map((module) => ({ module, contentId: winner?.id || null, available: Boolean(winner) }));
}

module.exports = { admit, compete, diffuse };
