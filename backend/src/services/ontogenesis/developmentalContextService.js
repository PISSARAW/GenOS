'use strict';

const { getResponsibility } = require('../shev/responsibilityService');
const { listEvents } = require('../gvxDevelopmentLedger');

function parseConfig(project) {
  try { return JSON.parse(project.config_json || '{}'); } catch (_) { return {}; }
}

async function shevContext(db, projectId) {
  try {
    const responsibility = await getResponsibility(db, projectId);
    const row = await db.get(`SELECT COUNT(*) AS count FROM shev_initiatives
      WHERE project_id = ? AND status IN ('proposed', 'queued')`, [projectId]);
    return {
      available: Boolean(responsibility),
      responsibility,
      pendingInitiatives: Number(row?.count || 0)
    };
  } catch (error) {
    return { available: false, reason: error.code || error.message, pendingInitiatives: 0 };
  }
}

function gvxScope(config, projectId) {
  const scope = config.gvxScope || {};
  if (!scope.organizationId || !scope.entityId) return null;
  return { organizationId: scope.organizationId, projectId, entityId: scope.entityId };
}

async function gvxContext(db, config, projectId) {
  const scope = gvxScope(config, projectId);
  if (!scope) return { available: false, reason: 'scope-explicite-requis', events: [] };
  try {
    const events = await listEvents(db, { ...scope, limit: 200 });
    return { available: true, scope, eventCount: events.length, events: events.slice(-20) };
  } catch (error) {
    return { available: false, scope, reason: error.code || error.message, events: [] };
  }
}

async function compileDevelopmentalContext(db, project) {
  const config = parseConfig(project);
  const [shev, gvx] = await Promise.all([
    shevContext(db, project.id),
    gvxContext(db, config, project.id)
  ]);
  return {
    shev,
    gvx,
    memory: { delegatedToRuntime: true, available: true },
    agow: { delegatedToRuntime: true, available: true },
    failClosed: !gvx.available && gvx.reason === 'scope-explicite-requis'
  };
}

module.exports = { compileDevelopmentalContext, gvxScope };
