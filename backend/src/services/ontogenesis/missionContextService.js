'use strict';

/**
 * Compile une mission et son workspace en contexte de backlog.
 * Pur du point de vue SQLite : l'inspection est locale et bornée, l'écriture
 * reste déléguée à projectStore/tickService.
 */

const fs = require('fs');
const path = require('path');
const morphogenesisPlanner = require('../morphogenesis/morphogenesisPlannerService');
const conceptRegistry = require('./canonicalConceptRegistry');

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
  const text = `${objective} ${profile.stack.join(' ')}`.toLowerCase();
  if (/répar|repar|fix|bug|regression|corrig/.test(text)) return 'repair';
  if (/audit|verif|test|preuve|controle/.test(text)) return 'verify';
  if (/explor|cartograph|comprendre|inventaire/.test(text)) return 'explore';
  if (/décid|decid|arbitr|choix|stratég|strateg/.test(text)) return 'decide';
  return 'implement';
}

function capabilitiesFor(profile, kind) {
  const capabilities = new Set(['execute', 'analyze']);
  if (kind === 'verify' || profile.scripts.includes('test')) capabilities.add('verify');
  if (profile.ecosystem === 'node') capabilities.add('observe');
  if (kind === 'implement') capabilities.add('coordinate');
  return [...capabilities];
}

function morphologyFor(project, profile, capabilities) {
  const requested = profile.stack.includes('react') ? 'a_team' : 'trinity';
  try {
    const plan = morphogenesisPlanner.planMorphogenesis({
      proposedTopology: requested,
      topologyProfile: { baseTopology: requested },
      problemProfile: { domain: profile.ecosystem, stack: profile.stack, objective: project.objective || '' },
      currentState: { topology: requested, agents: new Map(), capabilities, budgets: {} },
      availableCapabilities: capabilities, budget: 0, pressure: 0
    });
    return { selectedTopology: plan.selectedTopology, selectedOrganization: plan.selectedOrganization || null,
      graph: plan.morphologyGraphRef,
      candidates: plan.candidateMorphologies || [], receipt: plan.controlReceipt || null };
  } catch (error) {
    return { selectedTopology: null, graph: null, candidates: [], error: error.code || error.message };
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
  const capabilities = capabilitiesFor(profile, kind);
  const concepts = conceptRegistry.resolveMission({ objective: project.objective, profile, allowedCapabilities: capabilities });
  const tasks = buildTasks(project.objective || 'mission du projet', profile, kind);
  const context = JSON.stringify({ objective: project.objective || '', kind, profile });
  return {
    kind,
    profile,
    capabilities,
    capabilityCatalog: capabilityCatalog(),
    concepts,
    morphology: morphologyFor(project, profile, capabilities),
    context: context.slice(0, MAX_CONTEXT_CHARS),
    tasks: tasks.map((task) => ({ ...task, dependsOn: task.dependsOnIndex === undefined ? [] : [] }))
  };
}

function linkCompiledTasks(tasks) {
  return tasks.map((task) => ({ ...task, dependsOn: [] }));
}

module.exports = { compileMission, linkCompiledTasks, classifyMission };
