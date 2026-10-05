'use strict';

/**
 * Compile une mission et son workspace en contexte de backlog.
 * Pur du point de vue SQLite : l'inspection est locale et bornée, l'écriture
 * reste déléguée à projectStore/tickService.
 */

const fs = require('fs');
const path = require('path');
const morphogenesisPlanner = require('../morphogenesis/morphogenesisPlannerService');
const { isTopology } = require('../morphogenesis/morphogenesisOntology');
const conceptRegistry = require('./canonicalConceptRegistry');
const { CATALOG: topologyCatalog } = require('./topologySelector');
const dynamicOrganization = require('../dynamicOrganizationService');

const MAX_FILE_BYTES = 128 * 1024;
const MAX_CONTEXT_CHARS = 4000;

function readJson(root, name) {
  try {
    const file = path.join(root, name);
    const stat = fs.statSync(file);
    if (stat.size > MAX_FILE_BYTES) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function packageProfile(root) {
  const manifest = readJson(root, 'package.json');
  if (!manifest) return { ecosystem: 'unknown', stack: [], scripts: [] };
  const dependencies = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
  const stack = Object.keys(dependencies).filter((name) => /react|next|vite|vue|svelte|angular|express/.test(name));
  return { ecosystem: 'node', stack, scripts: Object.keys(manifest.scripts || {}) };
}

function fileProfile(root) {
  const names = ['src', 'app', 'pages', 'components', 'public', 'README.md'];
  return names.filter((name) => fs.existsSync(path.join(root, name)));
}

function classifyMission(objective, profile) {
  const text = normalizeText(`${objective} ${profile.stack.join(' ')}`);
  if (/répar|repar|fix|bug|regression|corrig/.test(text)) return 'repair';
  if (/audit|verif|test|preuve|controle/.test(text)) return 'verify';
  if (/explor|cartograph|comprendre|inventaire/.test(text)) return 'explore';
  if (/décid|decid|arbitr|choix|stratég|strateg/.test(text)) return 'decide';
  return 'implement';
}

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function topologyNeeds(topology) {
  return (topologyCatalog.find((entry) => entry.id === topology) || {}).needs || [];
}

function capabilitiesFor(profile, kind, topology) {
  const capabilities = new Set(['execute', 'analyze']);
  if (kind === 'verify' || profile.scripts.includes('test')) capabilities.add('verify');
  if (profile.ecosystem === 'node') capabilities.add('observe');
  if (kind === 'implement') capabilities.add('coordinate');
  for (const capability of topologyNeeds(topology)) capabilities.add(capability);
  return [...capabilities];
}

function projectConfig(project) {
  try { return JSON.parse(project.config_json || '{}'); } catch (_) { return {}; }
}

function organizationFor(project, topology) {
  const defaults = { trinity: 'strategy_arena', a_team: 'specialist_expert_committee',
    biome: 'energy_huddle', biocenose: 'blind_adversarial_review', holobionte: 'specialist_expert_committee',
    syncytium: 'memory_compilation', rhizome: 'mycelial_routing', metapopulation: 'quorum_with_abstention' };
  const configured = projectConfig(project).organization || defaults[topology];
  if (!configured || !dynamicOrganization.organizationProfile(configured)) {
    return { organization: null, error: 'organisation-configuree-inconnue' };
  }
  return { organization: configured, error: null };
}

function inferredTopology(project, profile, kind) {
  const config = projectConfig(project);
  const configured = config.topology || config.morphology?.topology;
  if (configured && !isTopology(configured)) return { topology: null, reason: 'topologie-configuree-inconnue' };
  if (configured) return { topology: configured, reason: 'configuration' };
  const text = normalizeText(`${project.objective || ''} ${profile.stack.join(' ')}`);
  if (/browser|navigat|forag|web.*collect|collect.*web/.test(text)) return { topology: 'biome', reason: 'perception-web' };
  if (/crdt|etat partage|état partagé|coherence distrib|cohérence distrib/.test(text)) return { topology: 'syncytium', reason: 'etat-partage' };
  if (/decentral|décentral|multi[- ]?branche|routage distrib|route distrib/.test(text)) return { topology: 'rhizome', reason: 'routage-distribue' };
  if (/recuper|récupér|resilien|résilien|crash|panne/.test(text) || kind === 'repair') {
    return { topology: 'metapopulation', reason: 'recuperation' };
  }
  if (/symbio|host|hote|hôte|immune/.test(text)) return { topology: 'holobionte', reason: 'relation-hote' };
  if (kind === 'explore') return { topology: 'rhizome', reason: 'exploration' };
  if (kind === 'decide') return { topology: 'biocenose', reason: 'deliberation' };
  if (kind === 'verify') return { topology: 'trinity', reason: 'verification-comparative' };
  if (profile.stack.includes('react') || profile.ecosystem === 'node') {
    return { topology: 'a_team', reason: 'implementation-structuree' };
  }
  return { topology: 'trinity', reason: 'repli-evidence' };
}

function morphologyFor(input) {
  const { project, profile, kind, capabilities } = input;
  const selection = input.selection || inferredTopology(project, profile, kind);
  const requested = selection.topology;
  const organization = organizationFor(project, requested);
  if (!requested) return { selectedTopology: null, requestedTopology: null, selectionReason: selection.reason,
    graph: null, candidates: [], error: selection.reason };
  if (organization.error) return { selectedTopology: null, requestedTopology: requested,
    selectionReason: selection.reason, selectedOrganization: null, graph: null, candidates: [], error: organization.error };
  try {
    const plan = morphogenesisPlanner.planMorphogenesis({
      proposedTopology: requested,
      proposedOrganization: organization.organization,
      topologyProfile: { baseTopology: requested },
      problemProfile: { domain: profile.ecosystem, stack: profile.stack, objective: project.objective || '' },
      currentState: { topology: requested, agents: new Map(), capabilities, budgets: {} },
      availableCapabilities: capabilities, budget: 0, pressure: 0
    });
    return { selectedTopology: plan.selectedTopology, requestedTopology: requested,
      selectionReason: selection.reason, selectedOrganization: plan.selectedOrganization || organization.organization,
      graph: plan.morphologyGraphRef,
      candidates: plan.candidateMorphologies || [], receipt: plan.controlReceipt || null };
  } catch (error) {
    return { selectedTopology: null, requestedTopology: requested, selectionReason: selection.reason,
      graph: null, candidates: [], error: error.code || error.message };
  }
}

function capabilityCatalog() {
  return conceptRegistry.capabilityCatalog();
}

function acceptanceFor(profile, kind) {
  const acceptance = [`mission_kind:${kind}`, `workspace_ecosystem:${profile.ecosystem}`];
  if (profile.stack.length) acceptance.push(`stack:${profile.stack.join(',')}`);
  if (profile.scripts.length) acceptance.push(`scripts:${profile.scripts.join(',')}`);
  return acceptance;
}

function buildTasks(objective, profile, kind) {
  const base = acceptanceFor(profile, kind);
  if (kind === 'verify') return [{ title: `verifier: ${objective}`, priority: 80, acceptance: base }];
  if (kind === 'repair') return [{ title: `reparer: ${objective}`, priority: 90, acceptance: base }];
  if (kind === 'explore') return [{ title: `explorer: ${objective}`, priority: 70, acceptance: base }];
  return [
    { title: `analyser: ${objective}`, priority: 100, acceptance: [...base, `files:${profile.files.join(',')}`] },
    { title: `implementer: ${objective}`, priority: 80, dependsOnIndex: 0, acceptance: base },
    { title: `verifier: ${objective}`, priority: 60, dependsOnIndex: 1, acceptance: [...base, 'checks:configured'] }
  ];
}

function compileMission(project) {
  const root = path.resolve(project.root_path);
  const profile = { ...packageProfile(root), files: fileProfile(root) };
  const kind = classifyMission(project.objective || '', profile);
  const selection = inferredTopology(project, profile, kind);
  const topology = selection.topology;
  const capabilities = capabilitiesFor(profile, kind, topology);
  const concepts = conceptRegistry.resolveMission({ objective: project.objective, profile, topology,
    missionKind: kind, allowedCapabilities: capabilities });
  const tasks = buildTasks(project.objective || 'mission du projet', profile, kind);
  const context = JSON.stringify({ objective: project.objective || '', kind, profile });
  return {
    kind,
    profile,
    capabilities,
    capabilityCatalog: capabilityCatalog(),
    concepts,
    morphology: morphologyFor({ project, profile, kind, capabilities, selection }),
    context: context.slice(0, MAX_CONTEXT_CHARS),
    tasks: tasks.map((task) => ({ ...task, dependsOn: task.dependsOnIndex === undefined ? [] : [] }))
  };
}

function linkCompiledTasks(tasks) {
  return tasks.map((task) => ({ ...task, dependsOn: [] }));
}

module.exports = { compileMission, linkCompiledTasks, classifyMission };
