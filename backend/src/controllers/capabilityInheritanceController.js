'use strict';

const { getDatabase } = require('../db');
const { getAllConcepts } = require('../services/capabilityGraphService');
const { accessFor } = require('../services/capabilityAccessMatrix');
const iamPolicyEngine = require('../services/iamPolicyEngine');
const { loadExportRegistry } = require('../services/capabilityInheritance/catalog/exportRegistryStore');
const { createDependencyGraph } = require('../services/capabilityInheritance/resolver/dependencyGraph');
const { resolveProjectInheritance } = require('../services/capabilityInheritance/resolver/compatibilityResolver');
const { planUpgrade, selectCandidateManifest } = require('../services/capabilityInheritance/evolution/upgradePlanner');
const { persistUpgradeCandidate } = require('../services/capabilityInheritance/evolution/upgradeCandidateService');
const { parseProjectManifest } = require('../services/capabilityInheritance/binding/projectManifestService');
const { invokeLinkedCapability } = require('../services/capabilityInheritance/adapters/linkedAdapter');
const { createPromotionGateHandlers } = require('../services/capabilityInheritance/adapters/promotionGateHandler');
const binding = require('../services/capabilityInheritance/binding/projectBindingService');

function createCapabilityInheritanceController(deps = {}) {
  const context = {
    dbProvider: deps.getDatabase || getDatabase,
    graphProvider: deps.getCapabilityGraph || getAllConcepts,
    accessProvider: deps.accessFor || accessFor,
    authorize: deps.authorize || iamPolicyEngine.authorize,
    invoke: deps.invokeLinkedCapability || invokeLinkedCapability,
    handlers: deps.createHandlers || createPromotionGateHandlers
  };
  return createControllerHandlers(context);
}

function createControllerHandlers(context) {
  return {
    discover: (req, res, next) => respond({ req, res, next, action: () => discoverAction(context) }),
    inspect: (req, res, next) => respond({ req, res, next, action: () => inspectAction(context, req) }),
    link: (req, res, next) => respond({ req, res, next, action: () => linkAction(context, req) }),
    resolve: (req, res, next) => respond({ req, res, next, action: () => planFor({ req, ...context }) }),
    adopt: (req, res, next) => respond({ req, res, next, action: () => adoptAction(context, req) }),
    status: (req, res, next) => respond({ req, res, next, action: () => statusAction(context, req) }),
    invoke: (req, res, next) => respond({ req, res, next, action: () => invokeAction(context, req) }),
    revoke: (req, res, next) => respond({ req, res, next, action: () => revokeAction(context, req) }),
    upgrade: (req, res, next) => respond({ req, res, next, action: () => upgradeAction(context, req) })
  };
}

async function discoverAction(context) {
  const registry = await getRegistry(context.dbProvider, context.graphProvider, context.accessProvider);
  return { capabilities: registry.listExports() };
}

async function inspectAction(context, req) {
  const registry = await getRegistry(context.dbProvider, context.graphProvider, context.accessProvider);
  const entry = registry.inspect(req.params.capabilityId, req.params.version);
  if (!entry) throw gciError('GCI_EXPORT_NOT_FOUND', 'Capability export not found');
  return entry;
}

async function linkAction(context, req) {
  const scope = requestScope(req, req.params.projectId);
  const manifest = readManifest(req, scope.projectId);
  return binding.bindProject({ db: await context.dbProvider(), ...scope, providerId: manifest.provider.id,
    manifest, expectedRevision: expectedRevision(req.body?.expectedRevision) });
}

async function adoptAction(context, req) {
  const plan = await planFor({ req, ...context });
  const scope = requestScope(req, plan.manifest.project.id);
  const result = await binding.adoptProject({ db: await context.dbProvider(), ...scope, manifest: plan.manifest,
    lockfile: plan.lockfile, expectedBindingRevision: expectedRevision(req.body?.expectedBindingRevision),
    expectedInstallationRevision: expectedRevision(req.body?.expectedInstallationRevision) });
  return { ...result, lockfile: plan.lockfile };
}

async function statusAction(context, req) {
  return binding.projectStatus({ db: await context.dbProvider(), ...requestScope(req, req.params.projectId) });
}

async function invokeAction(context, req) {
  const scope = requestScope(req, req.params.projectId);
  const body = invocationBody(req.body);
  const db = await context.dbProvider();
  return context.invoke({ db, ...scope, ...body,
    getProjectAuthority: async (input) => authorityForInvocation({ ...input, req, scope, authorize: context.authorize }),
    handlers: context.handlers(req) });
}

function invocationBody(body) {
  if (!body || typeof body.environment !== 'string' || !body.environment
      || typeof body.capabilityId !== 'string' || !body.capabilityId
      || !body.args || typeof body.args !== 'object' || Array.isArray(body.args)) {
    throw gciError('GCI_INVALID_INVOCATION', 'environment, capabilityId, and object args are required');
  }
  return { environment: body.environment, capabilityId: body.capabilityId, args: body.args };
}

async function authorityForInvocation(input) {
  const descriptor = { capabilityId: input.capability.capabilityId,
    requiredAuthority: input.capability.effectiveAuthority };
  const grants = await authorizedCapabilities({ req: input.req, scope: input.scope,
    descriptors: [descriptor], authorize: input.authorize });
  return grants[descriptor.capabilityId] || [];
}

async function revokeAction(context, req) {
  const scope = requestScope(req, req.params.projectId);
  const body = req.body || {};
  if (!body.capabilityId || !body.version || !body.environment || !body.reason) throw gciError('GCI_INVALID_REVOCATION', 'Revocation details are required');
  return binding.revokeProjectCapability({ db: await context.dbProvider(), ...scope, capabilityId: body.capabilityId,
    version: body.version, environment: body.environment, reason: body.reason,
    revokedBy: req.user?.keyId || req.user?.username || 'authenticated-principal',
    expectedRevision: expectedRevision(body.expectedRevision) });
}

async function upgradeAction(context, req) {
  const scope = requestScope(req, req.params.projectId);
  const manifest = readManifest(req, scope.projectId);
  const db = await context.dbProvider();
  const installed = await db.get(`SELECT lockfile_json, status FROM gci_installations
    WHERE organization_id = ? AND project_id = ? AND environment = ?`,
  [scope.organizationId, scope.projectId, manifest.project.environment]);
  if (!installed || installed.status !== 'active') throw gciError('GCI_INSTALLATION_INACTIVE', 'An active installation is required to plan an upgrade');
  const currentLockfile = JSON.parse(installed.lockfile_json);
  const registry = await loadExportRegistry({ db, capabilityGraph: context.graphProvider(), accessFor: context.accessProvider });
  const selected = selectCandidateManifest({ manifest, registry });
  const descriptors = createDependencyGraph({ requested: selected.inherit, registry });
  const projectAuthority = await authorizedCapabilities({ req, scope, descriptors, authorize: context.authorize });
  const plan = planUpgrade({ manifest, currentLockfile, registry, projectAuthority,
    resolvedAt: new Date().toISOString() });
  return persistUpgradeCandidate({ db, ...scope, environment: manifest.project.environment, plan,
    expectedRevision: expectedRevision(req.body?.expectedRevision) });
}

async function planFor(input) {
  const { req, dbProvider, graphProvider, accessProvider, authorize } = input;
  const scope = requestScope(req);
  const manifest = readManifest(req, scope.projectId);
  const db = await dbProvider();
  const registry = await loadExportRegistry({ db, capabilityGraph: graphProvider(), accessFor: accessProvider });
  const descriptors = createDependencyGraph({ requested: manifest.inherit, registry });
  const projectAuthority = await authorizedCapabilities({ req, scope, descriptors, authorize });
  const lockfile = resolveProjectInheritance({ manifest, registry, projectAuthority, resolvedAt: new Date().toISOString() });
  return { manifest, lockfile };
}

async function authorizedCapabilities(input) {
  const grants = {};
  for (const descriptor of input.descriptors) {
    grants[descriptor.capabilityId] = [];
    for (const permission of descriptor.requiredAuthority) {
      const result = await input.authorize({ context: policyContext(input, permission, descriptor.capabilityId), fallbackAllowed: false });
      if (result.allowed) grants[descriptor.capabilityId].push(permission);
    }
  }
  return grants;
}

function policyContext(input, action, capabilityId) {
  return { principal: input.req.user, action,
    resource: { type: 'gci-capability', id: capabilityId,
      organizationId: input.scope.organizationId, projectId: input.scope.projectId },
    request: { method: input.req.method, path: input.req.path },
    environment: { hour: new Date().getUTCHours(), weekday: new Date().getUTCDay() } };
}

async function getRegistry(dbProvider, graphProvider, accessProvider) {
  return loadExportRegistry({ db: await dbProvider(), capabilityGraph: graphProvider(), accessFor: accessProvider });
}

function requestScope(req, expectedProjectId) {
  const organizationId = req.tenant?.organizationId || String(req.headers['x-organization-id'] || '').trim();
  const projectId = req.tenant?.projectId || String(req.headers['x-project-id'] || '').trim();
  if (!organizationId || !projectId || (expectedProjectId && expectedProjectId !== projectId)) {
    throw gciError('GCI_PROJECT_SCOPE_DENIED', 'The request must target its authenticated tenant project');
  }
  return { organizationId, projectId };
}

function readManifest(req, projectId) {
  const raw = req.body?.manifest;
  const source = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const manifest = parseProjectManifest(source);
  if (manifest.project.id !== projectId) throw gciError('GCI_PROJECT_SCOPE_DENIED', 'Manifest project id must match the authenticated project');
  return manifest;
}

function expectedRevision(value) {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw gciError('GCI_INVALID_REVISION', 'Expected revision must be a non-negative integer');
  return value;
}

async function respond(input) {
  try {
    const result = await input.action();
    return input.res.json(result);
  } catch (error) {
    return input.next(error);
  }
}

function gciError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = code === 'GCI_PROJECT_SCOPE_DENIED' ? 403 : 400;
  return error;
}

module.exports = { createCapabilityInheritanceController };
