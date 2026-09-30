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
  const allowed = new Set(Array.isArray(workspace?.globalAccess) ? workspace.globalAccess : []);
  return target.map((module) => {
    const available = Boolean(winner && allowed.has(module));
    return { module, contentId: available ? winner.id : null, available };
  });
}

function consume(workspace, module, handler) {
  const delivery = diffuse(workspace, [module])[0];
  if (!delivery.available || typeof handler !== 'function') {
    return { ...delivery, consumed: false, output: null };
  }
  return { ...delivery, consumed: true, output: handler(delivery.contentId) };
}

function causalEffect(workspace, module, handler) {
  if (typeof handler !== 'function') return { measured: false, changed: false };
  const delivery = diffuse(workspace, [module])[0];
  if (!delivery.available) return { measured: false, changed: false };
  const delivered = handler(delivery.contentId);
  const ablated = handler(null);
  return {
    measured: true,
    changed: delivered !== ablated,
    delivered,
    ablated
  };
}

module.exports = { admit, compete, diffuse, consume, causalEffect };
