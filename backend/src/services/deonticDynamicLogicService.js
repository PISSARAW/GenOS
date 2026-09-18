'use strict';

function assessDuty({ obligations = [], permissions = [], prohibitions = [], action } = {}) {
  const name = String(action || '');
  if (!name) throw new Error('A deontic action is required.');
  if (![obligations, permissions, prohibitions].every((items) => Array.isArray(items) && items.every((item) => typeof item === 'string'))) throw new Error('Deontic rules must be arrays of strings.');
  const obligation = obligations.includes(name);
  const permission = permissions.includes(name);
  const prohibition = prohibitions.includes(name);
  return { action: name, obligation, permission, prohibition, conflict: obligation && prohibition, executable: false, status: obligation && prohibition ? 'contradictory' : 'evaluated', promotionEligible: false };
}

function publicAnnouncement({ model, announcement } = {}) {
  const worlds = Array.isArray(model?.worlds) ? model.worlds : [];
  if (!worlds.length || !String(announcement || '').trim()) throw new Error('A model and announcement are required.');
  const valuation = model?.valuation || {};
  const retained = worlds.filter((world) => Boolean(valuation[world]?.[announcement]));
  return { model: { ...model, worlds: retained }, announcement, removedWorlds: worlds.filter((world) => !retained.includes(world)), update: 'public-announcement', status: 'simulated', promotionEligible: false };
}

module.exports = { assessDuty, publicAnnouncement };
