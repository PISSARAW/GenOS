'use strict';

const crypto = require('node:crypto');
const store = require('./agentDnaStore');
const dna = require('./agentDna');
const expression = require('./workerGenomeExpression');
const integrity = require('./biologicalIntegrity');
const ledger = require('./gvxLedgerIntegrity');
const SCHEMA = 'genos.worker-dna-incarnation/v1';

function failure(code) { return Object.assign(new Error(code), { code }); }
function metadataOf(agent) {
  try { return JSON.parse(agent.metadata_json || '{}'); }
  catch (_) { throw failure('INVALID_WORKER_GENOME'); }
}
function signature(body) {
  ledger.assertSigningKeyConfigured();
  return ledger.macEvent(integrity.digest(body));
}
function signed(body) { return { ...body, signature: signature(body) }; }
function verifiedBinding(agent, scope) {
  const record = metadataOf(agent).dnaIncarnation;
  if (!record) return null;
  const { signature: actual, ...body } = record;
  const validScope = body.agentId === agent.id && body.parentId === agent.parent_agent_id
    && integrity.digest(body.scope) === integrity.digest(scope);
  if (body.schema !== SCHEMA || !validScope || !/^[a-f0-9]{64}$/.test(actual || '')) {
    throw failure('WORKER_DNA_BINDING_INVALID');
  }
  if (!crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(signature(body), 'hex'))) {
    throw failure('WORKER_DNA_BINDING_INVALID');
  }
  return record;
}

async function owner(db, input) {
  const row = await db.get(`SELECT a.*,w.organization_id,w.project_id FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, input.agent.id);
  if (!row || row.workspace_id !== input.agent.workspace_id
    || row.execution_mode !== input.agent.execution_mode) throw failure('WORKER_GENOME_SCOPE_MISMATCH');
  return { row, scope: { organizationId: row.organization_id, projectId: row.project_id } };
}

async function validateSource(db, input) {
  const { record, scope } = input;
  const model = await store.loadGenome(db, record.genomeRef, scope);
  const row = await db.get(`SELECT content_hash,status FROM agent_genomes WHERE id=?
    AND ((organization_id=? AND project_id=?) OR (organization_id IS NULL AND project_id IS NULL))`,
  record.genomeRef, scope.organizationId, scope.projectId);
  if (!model || row?.status !== 'active' || row.content_hash !== model.contentHash
    || record.contentHash !== model.contentHash) throw failure('WORKER_DNA_SOURCE_CHANGED');
  if (!await store.acceptGenome(db, model, scope)) throw failure('WORKER_DNA_UNTRUSTED');
  const genes = expression.express(dna.workerGenes(model));
  if (integrity.digest(genes) !== integrity.digest(record.genes)) throw failure('WORKER_DNA_SOURCE_CHANGED');
  return genes;
}

async function select(db, input) {
  const parent = await db.get(`SELECT a.*,w.organization_id,w.project_id FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, input.row.parent_agent_id);
  if (!parent || parent.organization_id !== input.scope.organizationId || parent.project_id !== input.scope.projectId) {
    throw failure('WORKER_GENOME_SCOPE_MISMATCH');
  }
  const assignment = input.mission.workerAssignment || {};
  const selection = await require('./agents/agentGenomeBindingService').selectForIncarnation({ db, parent,
    request: { agentId: input.row.id, role: input.row.role, workerKind: input.mission.workerKind,
      phenotype: { genomeRef: assignment.genomeRef, preferredName: assignment.preferredName },
      capabilityManifest: { owned: input.mission.capabilities || [] },
      mission: { prompt: input.mission.prompt || input.row.current_task } } });
  if (!selection) throw failure('WORKER_DNA_REQUIRED');
  const record = signed({ schema: SCHEMA, agentId: input.row.id, parentId: parent.id, scope: input.scope,
    genomeRef: selection.genomeRef, contentHash: selection.genomeContentHash,
    sourceFormat: selection.genomeFormat, sourceAlphabet: selection.genomeAlphabet,
    phenotypeHash: selection.phenotypeHash, selectionId: selection.selectionId,
    genes: expression.express(selection.genes) });
  await validateSource(db, { record, scope: input.scope });
  await assertSelection(db, record);
  return record;
}

async function assertSelection(db, record) {
  const row = await db.get(`SELECT agent_id,genome_ref,organization_id,project_id
    FROM agent_genome_selections WHERE id=?`, record.selectionId);
  if (row?.agent_id !== record.agentId || row.genome_ref !== record.genomeRef
    || row.organization_id !== record.scope.organizationId || row.project_id !== record.scope.projectId) {
    throw failure('WORKER_DNA_SELECTION_REQUIRED');
  }
}

async function persist(db, input) {
  const metadata = { ...metadataOf(input.row), dnaIncarnation: input.record };
  const encoded = JSON.stringify(metadata);
  const updated = await db.run(`UPDATE agents SET metadata_json=? WHERE id=?
    AND metadata_json=? AND (status!='running' OR NOT EXISTS (
      SELECT 1 FROM strategy_execution_runs r WHERE r.agent_id=agents.id AND r.status IN ('planned','running')))`,
  encoded, input.row.id, input.row.metadata_json);
  if (updated.changes !== 1) throw failure('WORKER_DNA_BINDING_CONFLICT');
  input.row.metadata_json = encoded;
}

async function prepare(db, input) {
  await require('./workerClinicalAdmission').admit(db, input);
  if (input.agent.execution_mode !== 'worker' || !expression.usesCognitiveGenome(input.mission)) return;
  const state = await owner(db, input);
  let record = verifiedBinding(state.row, state.scope);
  if (!record && !store.dnaEnabled()) return;
  if (!record) {
    record = await select(db, { ...state, mission: input.mission });
    await persist(db, { row: state.row, record });
  }
  await assertSelection(db, record);
  const genes = await validateSource(db, { record, scope: state.scope });
  input.agent.metadata_json = state.row.metadata_json;
  input.mission.dnaIncarnation = record;
  input.mission.genome = genes;
}

module.exports = { SCHEMA, prepare, verifiedBinding, validateSource };
