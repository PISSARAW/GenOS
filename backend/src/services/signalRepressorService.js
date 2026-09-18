'use strict';

function createRepressor(target, reason, options = {}) {
  return {
    id: options.id || `repressor-${Date.now()}`,
    target: String(target || ''),
    reason: String(reason || 'noise'),
    expiresAt: options.ttlMs ? Date.now() + Number(options.ttlMs) : null,
    priority: Number(options.priority) || 1
  };
}

function applyRepressors(signal, repressors, now = Date.now()) {
  const active = (Array.isArray(repressors) ? repressors : []).filter((item) => !item.expiresAt || item.expiresAt > now);
  const blocked = active.filter((item) => item.target === signal?.kind || item.target === '*');
  return {
    accepted: blocked.length === 0,
    signal: blocked.length ? null : signal,
    suppressedBy: blocked.map((item) => item.id),
    reason: blocked[0]?.reason || null
  };
}

module.exports = { createRepressor, applyRepressors };
