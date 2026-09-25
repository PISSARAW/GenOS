'use strict';

const rhizome = require('../rhizomeCoordinationService');

const MAX_BRANCH_NODES = 32;
const RELATIONS = new Set(['ROUTES_TO', 'TRANSLATES_TO', 'DEPENDS_ON', 'VERIFIES', 'PROVIDES_INPUT', 'PRODUCES_FOR', 'BRIDGES']);

async function collect(db, sessionId, workers) {
  const branches = [];
  for (const worker of workers || []) branches.push(await readBranch(db, worker));
  const additions = branches.flatMap((branch) => branch.structured ? graphAdditions(branch) : []);
  const snapshot = await rhizome.graphSnapshot(sessionId, { db });
  const knownBeforeGrowth = new Set(snapshot.nodes.map((node) => node.nodeId));
  additions.filter((addition) => !addition.node.localContext?.unknownDependency)
    .forEach((addition) => knownBeforeGrowth.add(addition.node.nodeId));
  const branchCandidates = discoveredBranchCandidates(branches, knownBeforeGrowth);
  await growGraph({ sessionId, additions, snapshot, db });
  const graph = await rhizome.graphSnapshot(sessionId, { db });
  const complete = allAnswered(branches);
  const publicBranches = branches.map(publicBranch);
  return {
    status: complete ? 'completed' : 'partial',
    complete,
    answer: renderAnswers(publicBranches),
    branches: publicBranches,
    branchCandidates,
    graph
  };
}

function discoveredBranchCandidates(branches, known) {
  const candidates = new Map();
  for (const branch of branches) {
    for (const item of branchDependencies(branch)) {
      const label = text(item?.label || item?.name || item?.id);
      const id = slug(item?.id || label);
      if (!id || !label || known.has(id) || candidates.has(id)) continue;
      candidates.set(id, { id, label, reason: text(item.reason), sourceRole: branch.role, evidenceEventId: branch.evidenceEventId });
    }
  }
  return [...candidates.values()];
}

function branchDependencies(branch) {
  const stated = limitedList(branch.structured?.unknownDependencies);
  if (stated.length) return stated;
  return inferNetworkDependency(branch);
}

function inferNetworkDependency(branch) {
  const capabilities = limitedList(branch.structured?.capabilities);
  if (capabilities.some((item) => /network|connectiv|réseau|connexion/i.test(text(`${item?.id} ${item?.label}`)))) return [];
  const answer = text(branch.structured?.answer);
  if (!/\b(?:internet|wifi|wi-fi|réseau|network|connexion réseau)\b/i.test(answer)) return [];
  return [{
    id: 'network-connectivity', label: 'Connectivité réseau',
    reason: 'La branche décrit un transfert via Internet mais aucune capacité réseau cartographiée; à vérifier comme dépendance nécessaire.'
  }];
}

function allAnswered(branches) {
  return branches.length > 0 && branches.every((branch) => branch.status === 'completed'
    && branch.answer && hasRhizomeSchema(branch.structured));
}

function hasRhizomeSchema(value) {
  return Boolean(value && typeof value.answer === 'string' && value.answer.trim()
    && Array.isArray(value.capabilities) && Array.isArray(value.unknownDependencies)
    && Array.isArray(value.interfaces) && Array.isArray(value.assumptions)
    && Array.isArray(value.evidence));
}

function publicBranch(branch) {
  const { structured, ...value } = branch;
  return { ...value, answer: typeof structured?.answer === 'string' ? structured.answer : branch.answer };
}

function renderAnswers(branches) {
  const answers = [];
  for (const branch of branches) {
    if (branch.status !== 'completed' || !branch.answer) continue;
    answers.push(`## ${branch.role}\n${branch.answer}`);
  }
  return answers.join('\n\n');
}

async function readBranch(db, worker) {
  if (!worker.workerId) return failedBranch(worker);
  const row = await db.get('SELECT status, current_task FROM agents WHERE id = ?', worker.workerId);
  const event = await db.get(
    "SELECT id, payload_json FROM telemetry_events WHERE agent_id = ? AND event_type = 'EVIDENCE_REPORT' ORDER BY id DESC LIMIT 1",
    worker.workerId
  );
  return branchFromEvidence({ worker, row, event });
}

function branchFromEvidence(context) {
  const { worker, row, event } = context;
  const report = parsePayload(event && event.payload_json);
  const answer = reportAnswer(report);
  const complete = branchHasSuccessfulEvidence(row, report, answer);
  const parsed = complete ? parseStructured(answer) : null;
  const structured = parsed ? normalizeRhizomeStructure({ value: parsed, report }) : null;
  return {
    ...branchIdentity(worker),
    status: resolvedBranchStatus(complete, row),
    answer,
    failureReason: complete ? null : (row && row.current_task) || null,
    evidenceEventId: (event && event.id) || null,
    provenance: reportProvenance(report),
    structured
  };
}

function branchIdentity(worker) {
  return {
    workerId: worker.workerId, role: worker.role,
    branchCandidateId: worker.branchCandidateId || null,
    branchCandidateLabel: worker.branchCandidateLabel || null,
    branchCandidateReason: worker.branchCandidateReason || null
  };
}

function resolvedBranchStatus(complete, row) {
  if (complete) return 'completed';
  return row && row.status || 'unknown';
}

function reportProvenance(report) {
  const artifact = report && report.workerArtifact;
  return artifact && artifact.provenance || null;
}

function normalizeRhizomeStructure(context) {
  const { value, report } = context;
  const claims = Array.isArray(value.claims) ? value.claims : [];
  const artifact = value.workerArtifact?.content || {};
  return {
    ...value,
    answer: normalizedAnswer(value, claims, artifact),
    capabilities: normalizedList(value, artifact, 'capabilities'),
    unknownDependencies: normalizedList(value, artifact, 'unknownDependencies'),
    interfaces: normalizedList(value, artifact, 'interfaces'),
    assumptions: normalizedList(value, artifact, 'assumptions'),
    evidence: normalizedEvidence(value, claims, report)
  };
}

function normalizedAnswer(value, claims, artifact) {
  const claim = claims.find((item) => text(item?.statement));
  const observation = limitedList(artifact.observations).map(text).filter(Boolean).join('\n');
  return text(value.answer || claim?.statement || observation);
}

function normalizedList(value, artifact, field) {
  return limitedList(value[field] || artifact[field]);
}

function normalizedEvidence(value, claims, report) {
  const fromClaims = claims.flatMap((item) => limitedList(item?.evidence));
  const evidence = Array.isArray(value.evidence) ? value.evidence : fromClaims;
  return evidence.length ? evidence : limitedList(report?.workerArtifact?.provenance?.sourceRefs);
}

function branchHasSuccessfulEvidence(row, report, answer) {
  return row?.status === 'completed' && report?.outcome === 'success' && Boolean(answer);
}

function failedBranch(worker) {
  return {
    workerId: null,
    role: worker.role,
    status: worker.status || 'error',
    answer: '',
    failureReason: worker.failureReason || 'Rhizome branch could not be dispatched.',
    evidenceEventId: null,
    provenance: null,
    structured: null
  };
}

function parsePayload(value) {
  try {
    const payload = JSON.parse(value || '{}');
    return payload.evidenceReport || payload.report || payload;
  } catch (_) {
    return null;
  }
}

function reportAnswer(report) {
  const claims = report?.claims?.length ? report.claims : report?.workerArtifact?.content?.claims || [];
  const statement = claims.find((claim) => typeof claim?.statement === 'string')?.statement;
  return String(statement || '').trim();
}

function parseStructured(answer) {
  const text = String(answer || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const candidate = extractObject(text);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function extractObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return '';
  const state = { depth: 0, quoted: false, escaped: false, text, start };
  for (let index = start; index < text.length; index += 1) {
    const result = scanJsonCharacter(state, text[index], index);
    if (result) return result;
  }
  return '';
}

function scanJsonCharacter(state, character, index) {
  if (state.quoted) return scanQuoted(state, character);
  if (character === '"') state.quoted = true;
  else if (character === '{') state.depth += 1;
  else if (character === '}') {
    state.depth -= 1;
    if (state.depth === 0) return state.text.slice(state.start, index + 1);
  }
  return '';
}

function scanQuoted(state, character) {
  if (state.escaped) state.escaped = false;
  else if (character === '\\') state.escaped = true;
  else if (character === '"') state.quoted = false;
  return '';
}

function graphAdditions(branch) {
  const records = [];
  for (const item of limitedList(branch.structured.capabilities)) records.push(normalizeRecord(item, branch, false));
  for (const item of limitedList(branch.structured.unknownDependencies)) records.push(normalizeRecord(item, branch, true));
  addCandidateRecord(records, branch);
  const interfaces = limitedList(branch.structured.interfaces);
  return records.filter(Boolean).map((record) => ({ ...record, interfaces }));
}

function addCandidateRecord(records, branch) {
  const candidateId = slug(branch.branchCandidateId);
  if (!candidateId || records.some((record) => record?.node.nodeId === candidateId)) return;
  records.push(normalizeRecord({
    id: candidateId,
    label: branch.branchCandidateLabel || candidateId,
    reason: branch.branchCandidateReason || 'Dependency branch created for verification.'
  }, branch, true));
}

function limitedList(value) {
  return Array.isArray(value) ? value.slice(0, MAX_BRANCH_NODES) : [];
}

function normalizeRecord(item, branch, unknown) {
  if (typeof item === 'string') item = { id: item, label: item };
  if (!item || typeof item !== 'object') return null;
  const label = text(item.label || item.name || item.id);
  const nodeId = slug(item.id || label);
  if (!label || !nodeId) return null;
  return {
    node: {
      nodeId,
      kind: 'AGENT',
      capabilities: [nodeId],
      inputs: strings(item.inputs),
      outputs: strings(item.outputs),
      evidenceRequirements: [],
      state: 'DISCOVERED',
      localContext: {
        label,
        description: text(item.description || item.reason),
        discoveredBy: branch.role,
        unknownDependency: unknown
      },
      provenance: [`telemetry-event:${branch.evidenceEventId}`]
    },
    dependsOn: strings(item.dependsOn).map(slug).filter(Boolean),
    role: branch.role,
    evidenceEventId: branch.evidenceEventId
  };
}

async function growGraph(context) {
  const { sessionId, additions, snapshot, db } = context;
  const known = new Set(snapshot.nodes.map((node) => node.nodeId));
  const accepted = [];
  for (const addition of additions) {
    if (known.has(addition.node.nodeId)) continue;
    await rhizome.addCapabilityNode(sessionId, addition.node, { db });
    known.add(addition.node.nodeId);
    accepted.push(addition);
  }
  await growEdges({
    sessionId, accepted, all: additions, known,
    knownEdges: new Set(snapshot.edges.map((edge) => edge.edgeId)), db
  });
}

async function growEdges(context) {
  const { sessionId, accepted, all, known, knownEdges, db } = context;
  const byId = new Map(all.map((item) => [item.node.nodeId, item]));
  const edgeIds = new Set(knownEdges);
  for (const item of accepted) {
    for (const dependency of item.dependsOn) {
      if (known.has(dependency)) await addDormantEdge({
        sessionId, from: dependency, to: item.node.nodeId, relation: 'DEPENDS_ON', edgeIds, db
      });
    }
  }
  for (const item of all) {
    const relations = limitedList(item.interfaces || []);
    for (const link of relations) await addInterface({ sessionId, link, byId, known, edgeIds, db });
  }
}

async function addInterface(context) {
  const { sessionId, link, byId, known, edgeIds, db } = context;
  const from = slug(link?.from);
  const to = slug(link?.to);
  const relation = interfaceRelation(link?.relation);
  if (from && to && from !== to && known.has(from) && known.has(to) && byId.has(from) && byId.has(to) && RELATIONS.has(relation)) {
    await addDormantEdge({ sessionId, from, to, relation, edgeIds, db });
  }
}

function interfaceRelation(value) {
  const relation = String(value || 'BRIDGES').toUpperCase();
  return relation === 'REQUIRES' ? 'DEPENDS_ON' : relation;
}

async function addDormantEdge(context) {
  const { sessionId, from, to, relation, edgeIds, db } = context;
  const edgeId = slug(`${from}-${relation}-${to}`);
  if (!edgeId || edgeIds.has(edgeId)) return;
  edgeIds.add(edgeId);
  await rhizome.addCapabilityEdge(sessionId, { edgeId, from, to, relation, status: 'DORMANT' }, { db });
}

function strings(value) {
  return Array.isArray(value) ? value.slice(0, MAX_BRANCH_NODES).map(text).filter(Boolean) : [];
}

function text(value) {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

function slug(value) {
  return text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

module.exports = { collect, parseStructured, graphAdditions, discoveredBranchCandidates };
