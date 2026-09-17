'use strict';

function assessDuty({ obligations = [], permissions = [], prohibitions = [], action } = {}) {
  const name = String(action || '');
  const obligation = obligations.includes(name);
  const permission = permissions.includes(name);
  const prohibition = prohibitions.includes(name);
  return { action: name, obligation, permission, prohibition, conflict: obligation && prohibition, executable: false, promotionEligible: false };
}

function publicAnnouncement({ model, announcement } = {}) {
  const worlds = Array.isArray(model?.worlds) ? model.worlds : [];
  const valuation = model?.valuation || {};
  const retained = worlds.filter((world) => Boolean(valuation[world]?.[announcement]));
  return { model: { ...model, worlds: retained }, announcement, removedWorlds: worlds.filter((world) => !retained.includes(world)), update: 'public-announcement', promotionEligible: false };
}

module.exports = { assessDuty, publicAnnouncement };
