'use strict';

/**
 * @file capabilityAccessMatrix.js
 * @description Matrice de reference verifiable : chaque capacite GenOS est
 * classee avec son niveau d'acces voulu (outil MCP, service interne, ou
 * aucun acces direct), les roles concernes, les outils necessaires et leur
 * etat (operationnel, partiel, conceptuel). Une capacite sans outil MCP mais
 * executee dans un service interne est marquee `internal_runtime`, jamais
 * presentee comme un lease effectif.
 */

const topologyCapabilities = require('./topologyCapabilityService');
const leasePolicy = require('./toolLeasePolicy');
const canonicalCatalog = require('../../../shared/toolDefinitions.json');

const ACCESS_MCP_TOOL = 'mcp_tool';
const ACCESS_INTERNAL = 'internal_runtime';
const ACCESS_PARTIAL = 'partial';
const ACCESS_PROPOSED = 'proposed';
const ACCESS_DENIED = 'denied';

const STATE_OPERATIONAL = 'operationnel';
const STATE_PARTIAL = 'partiel';
const STATE_CONCEPTUAL = 'conceptuel';

// Capacites sans outil MCP : choix explicite interne / partiel / propose,
// avec le service responsable quand il existe.
const INTERNAL_REALIZATION = Object.freeze({
  SWARM_METRICS: { level: ACCESS_INTERNAL, service: 'swarmMetricsService', note: 'metriques lues en interne, exposees via observabilite' },
  CONSCIENCE_HOMEOSTASIS: { level: ACCESS_INTERNAL, service: 'agentConscienceService', note: 'homeostasie interne, pas de dispatch MCP' },
  CHAOS_ENGINEERING: { level: ACCESS_PARTIAL, service: 'canaryExperimentService', note: 'recovery isolee outillee, chaos complet non pret' },
  MODEL_ROUTING: { level: ACCESS_INTERNAL, service: 'agentModelRoutingService', note: 'routage SLM/frontier interne' },
  LOCAL_INFERENCE: { level: ACCESS_INTERNAL, service: 'agentRuntimeExecutable', note: 'execution locale, pas un outil loue' },
  INFERENCE_GATEWAY: { level: ACCESS_PROPOSED, note: 'passerelle unifiee non prete' },
  COMPLIANCE: { level: ACCESS_PROPOSED, note: 'contrat de schema sans route MCP ni execution verifiee' }
});

// Routes mirrored from mcp/toolCallHandler.js and checked by the coherence test.
const ROUTABLE_TOOLS = Object.freeze([
  'genos_a_team_preview', 'genos_audit', 'genos_biological_mode', 'genos_biomimicry',
  'genos_capsule_create', 'genos_change_organization', 'genos_change_strategy',
  'genos_delegate_worker', 'genos_execute_primitive', 'genos_execute_strategy_pipeline',
  'genos_merge', 'genos_orchestrate', 'genos_organization_state', 'genos_philosophy',
  'genos_replay', 'genos_report_progress', 'genos_snapshot', 'genos_trinity_launch',
  'genos_v2_fork', 'genos_v2_init', 'genos_worker_inbox', 'genos_worker_publish'
]);
const ROUTABLE_TOOL_SET = new Set(ROUTABLE_TOOLS);
const ALL_CATALOGUED_TOOLS = new Set(canonicalCatalog.tools.map((tool) => tool.name));
const CATALOGUED_TOOLS = new Set(ROUTABLE_TOOLS.filter((tool) => ALL_CATALOGUED_TOOLS.has(tool)));

const DAEMON_INTERNAL_OPS = Object.freeze([
  { op: 'observe', scope: ['daemonId', 'territoire', 'headSha'], authority: 'lecture seule' },
  { op: 'index', scope: ['daemonId', 'territoire', 'headSha'], authority: 'lecture seule' },
  { op: 'snapshot', scope: ['daemonId', 'territoire', 'headSha'], authority: 'capture bornee au territoire' },
  { op: 'test_safe', scope: ['daemonId', 'territoire', 'headSha'], authority: 'execution non mutante' },
  { op: 'publish_signal', scope: ['daemonId', 'territoire', 'headSha'], authority: 'signal zero-text uniquement' },
  { op: 'read_handoff', scope: ['daemonId', 'territoire', 'headSha'], authority: 'lecture du handoff/findings concernes' }
]);

const DAEMON_FORBIDDEN = Object.freeze([
  'filesystem_write', 'promotion', 'mission_decision', 'push', 'merge', 'delegation'
]);

function internalEntry(capability) {
  return INTERNAL_REALIZATION[capability] || null;
}

function cataloguedTools(tools) {
  return (tools || []).filter((tool) => ALL_CATALOGUED_TOOLS.has(tool));
}

function missingTools(tools) {
  return (tools || []).filter((tool) => !ALL_CATALOGUED_TOOLS.has(tool));
}

function missingRoutes(tools) {
  return (tools || []).filter((tool) => !ROUTABLE_TOOL_SET.has(tool));
}

function levelFor(capability, tools) {
  const internal = internalEntry(capability);
  if (internal) return internal.level;
  if (!tools || !tools.length) return ACCESS_PROPOSED;
  if (missingTools(tools).length > 0 || missingRoutes(tools).length > 0) return ACCESS_PARTIAL;
  return ACCESS_MCP_TOOL;
}

function stateFor(level) {
  if (level === ACCESS_MCP_TOOL || level === ACCESS_INTERNAL) return STATE_OPERATIONAL;
  if (level === ACCESS_PARTIAL) return STATE_PARTIAL;
  return STATE_CONCEPTUAL;
}

function rolesFor(level) {
  if (level === ACCESS_MCP_TOOL || level === ACCESS_PARTIAL) {
    return ['orchestrator', 'worker', 'sub_orchestrator'];
  }
  if (level === ACCESS_INTERNAL) return ['daemon', 'orchestrator'];
  return [];
}

function serviceFor(capability, level) {
  const internal = internalEntry(capability);
  if (internal) return internal.service;
  if (level === ACCESS_DENIED || level === ACCESS_PROPOSED) return null;
  return 'backend:mcpToolRegistry';
}

function accessFor(capability) {
  const tools = leasePolicy.CAPABILITY_TOOLS[capability] || [];
  const level = levelFor(capability, tools);
  const internal = internalEntry(capability);
  return {
    capability,
    level,
    roles: rolesFor(level),
    tools: [...tools],
    catalogued: cataloguedTools(tools),
    missingFromCatalog: missingTools(tools),
    missingRoutes: missingRoutes(tools),
    service: serviceFor(capability, level),
    state: stateFor(level),
    note: internal ? internal.note : null
  };
}

function fullMatrix() {
  return topologyCapabilities.GENOS_CAPABILITIES.map(accessFor);
}

function auditMode(mode) {
  const contract = topologyCapabilities.capabilitiesForMode(mode);
  const required = contract ? contract.required : [];
  const entries = required.map(accessFor);
  const blocked = entries.filter((entry) => entry.level !== ACCESS_MCP_TOOL);
  return {
    mode,
    required,
    fullyTooled: blocked.length === 0,
    blocked: blocked.map((entry) => entry.capability),
    entries
  };
}

function auditModes() {
  const modes = Object.keys(topologyCapabilities.MODE_CAPABILITIES);
  return modes.map((mode) => auditMode(mode));
}

function daemonInterface() {
  return { ops: [...DAEMON_INTERNAL_OPS], forbidden: [...DAEMON_FORBIDDEN], access: ACCESS_INTERNAL };
}

module.exports = {
  ACCESS_MCP_TOOL,
  ACCESS_INTERNAL,
  ACCESS_PARTIAL,
  ACCESS_PROPOSED,
  ACCESS_DENIED,
  ROUTABLE_TOOLS,
  CATALOGUED_TOOLS,
  DAEMON_INTERNAL_OPS,
  DAEMON_FORBIDDEN,
  accessFor,
  fullMatrix,
  auditModes,
  auditMode,
  daemonInterface
};
