'use strict';

const persistence = require('../agowStatePersistenceService');

const SCOPE = 'agow_direct_pathways';
const REVIEW_FLAGS = ['irreversible', 'highStakes', 'lowCausalConfidence', 'userApprovalRequired', 'securitySensitive', 'nonStationary'];

function needsReview(policy = {}) {
  return policy.requiresGlobalReview === true || REVIEW_FLAGS.some((flag) => policy[flag] === true);
}

function validateRoute(route) {
  if (!route?.pathwayId || !route.source || !route.target || !route.semanticType || !route.capability) return false;
  if (!['novel', 'provisional', 'consolidating', 'consolidated', 'degraded', 'suspended'].includes(route.status)) return false;
  return Number.isFinite(route.confidence) && route.confidence >= 0 && route.confidence <= 1;
}

async function loadRoutes(options) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return { loaded, routes: Array.isArray(loaded.state.routes) ? loaded.state.routes : [] };
}

async function saveRoutes(options, loaded, routes) {
  await persistence.save({ scope: SCOPE, agentId: options.agentId, db: loaded.db,
    state: { routes: routes.slice(-1000) }, version: Date.now() });
  return routes;
}

async function register(options) {
  if (!options?.agentId || !validateRoute(options.route)) throw new TypeError('Direct pathway route is invalid.');
  const { loaded, routes } = await loadRoutes(options);
  const route = { ...options.route, requiresGlobalReview: needsReview(options.route),
    status: options.route.status || 'provisional', updatedAt: Date.now() };
  const next = routes.filter((item) => item.pathwayId !== route.pathwayId);
  next.push(route);
  await saveRoutes(options, loaded, next);
  return route;
}

async function resolve(options) {
  const { routes } = await loadRoutes(options);
  return routes.find((route) => matchesRoute(route, options)) || null;
}

function matchesRoute(route, options) {
  return consolidated(route) && matchesNeed(route, options) && matchesTarget(route, options)
    && route.confidence >= (options.minimumConfidence ?? 0.8);
}

function consolidated(route) {
  return route.status === 'consolidated' && !route.requiresGlobalReview;
}

function matchesNeed(route, options) {
  return route.capability === options.capability
    && (route.contextHash === options.contextHash || route.contextHash === '*');
}

function matchesTarget(route, options) {
  const inTargets = !options.targets || options.targets.includes(route.target);
  const exactTarget = !options.target || route.target === options.target;
  return inTargets && exactTarget;
}

async function suspend(options) {
  const { loaded, routes } = await loadRoutes(options);
  let suspended = null;
  const next = routes.map((route) => {
    if (route.pathwayId !== options.pathwayId) return route;
    suspended = { ...route, status: 'suspended', suspendedAt: Date.now(), suspensionReason: options.reason };
    return suspended;
  });
  if (!suspended) return null;
  await saveRoutes(options, loaded, next);
  return suspended;
}

async function list(options) {
  return (await loadRoutes(options)).routes;
}

module.exports = { register, resolve, suspend, list, validateRoute, needsReview, SCOPE };
