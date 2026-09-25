'use strict';

const rhizome = require('../rhizomeCoordinationService');

const MAX_BRANCH_NODES = 32;
const RELATIONS = new Set(['ROUTES_TO', 'TRANSLATES_TO', 'DEPENDS_ON', 'VERIFIES', 'PROVIDES_INPUT', 'PRODUCES_FOR', 'BRIDGES']);

async function collect(db, sessionId, workers) {
  const branches = [];
  for (const worker of workers || []) branches.push(await readBranch(db, worker));
  const additions = branches.flatMap((branch) => branch.structured ? graphAdditions(branch) : []);
  const snapshot = await rhizome.graphSnapshot(sessionId, { db });
  await growGraph({ sessionId, additions, snapshot, db });
  const graph = await rhizome.graphSnapshot(sessionId, { db });
  const complete = allAnswered(branches);
  const publicBranches = branches.map(publicBranch);
  return {
    status: complete ? 'completed' : 'partial',
    complete,
    answer: renderAnswers(publicBranches),
    branches: publicBranches,
    graph
  };
}

function allAnswered(branches) {
  return branches.length > 0 && branches.every((branch) => branch.status === 'completed' && branch.answer);
}

function publicBranch(branch) {
  const { structured, ...value } = branch;
  return { ...value, answer: typeof structured?.answer === 'string' ? structured.answer : branch.answer };
}

function renderAnswers(branches) {
  return branches.filter((branch) => branch.status === 'completed' && branch.answer)
    .map((branch) => `## ${branch.role}\n${branch.answer}`).join('\n\n');
}

async function readBranch(db, worker) {
  const row = await db.get('SELECT status FROM agents WHERE id = ?', worker.workerId);
  const event = await db.get(
    "SELECT id, payload_json FROM telemetry_events WHERE agent_id = ? AND event_type = 'EVIDENCE_REPORT' ORDER BY id DESC LIMIT 1",
    worker.workerId
  );
  const report = parsePayload(event?.payload_json);
  const answer = reportAnswer(report);
  const complete = row?.status === 'completed' && report?.outcome === 'success' && Boolean(answer);
  const structured = complete ? parseStructured(answer) : null;
  return {
    workerId: worker.workerId,
    role: worker.role,
    status: complete ? 'completed' : row?.status || 'unknown',
    answer,
    evidenceEventId: event?.id || null,
    provenance: report?.workerArtifact?.provenance || null,
    structured
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
  const interfaces = limitedList(branch.structured.interfaces);
  return records.filter(Boolean).map((record) => ({ ...record, interfaces }));
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
  await growEdges({ sessionId, accepted, all: additions, known, db });
}

async function growEdges(context) {
  const { sessionId, accepted, all, known, db } = context;
  const byId = new Map(all.map((item) => [item.node.nodeId, item]));
  const edgeIds = new Set();
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
  const relation = String(link?.relation || 'BRIDGES').toUpperCase();
  if (from && to && from !== to && known.has(from) && known.has(to) && byId.has(from) && byId.has(to) && RELATIONS.has(relation)) {
    await addDormantEdge({ sessionId, from, to, relation, edgeIds, db });
  }
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

module.exports = { collect, parseStructured, graphAdditions };
