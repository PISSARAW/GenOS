'use strict';

const fossilization = require('./fossilizationService');

function normalizeTool(tool) {
  let out = '';
  for (const character of String(tool || '')) {
    if (/[a-z0-9]/i.test(character)) out += character.toUpperCase();
    else if ('_- .:/'.includes(character)) out += '_';
  }
  while (out.endsWith('_')) out = out.slice(0, -1);
  return out.slice(0, 50);
}

function fossilConcepts(record) {
  const payload = record && record.mineral_payload;
  const sources = [
    ...(Array.isArray(record && record.hard_parts) ? record.hard_parts : []),
    ...(payload && typeof payload === 'object'
      ? ['tools', 'contracts', 'golden_paths', 'provenance'].flatMap((key) => Array.isArray(payload[key]) ? payload[key] : [])
      : [])
  ];
  const seen = new Set();
  return sources.filter((value) => {
    const instruction = String(value || '').trim();
    if (!instruction || seen.has(instruction)) return false;
    seen.add(instruction);
    return true;
  }).map((instruction) => ({ locus: `FOSSIL_${normalizeTool(instruction)}`, instruction }));
}

async function hasPersistedTrustedEvidence(db, context) {
  const { row, evidence, model } = context;
  if (evidence.source === 'stratigraphic_fossil') {
    return verifyFossilEvidence(db, context);
  }
  if (evidence.source === 'morphogenesis_paired_outcome') {
    return require('./morphogenesis/morphogenesisGenomeOutcomeEvidence')
      .verifyGenomeOutcomeEvidence(db, context);
  }
  if (evidence.source !== 'validated_worker_success') return false;
  return verifyWorkerEvidence(db, context);
}

async function verifyFossilEvidence(db, context) {
  const { row, evidence, model } = context;
  const fossil = await fossilization.loadVerifiedFossil(db, evidence.fossilId, row);
  if (!fossil || evidence.integrityVerified !== true || evidence.payloadHash !== fossil.payload_hash) return false;
  const knownConcepts = new Set(fossilConcepts(fossil).map((concept) => `${concept.locus}:${concept.instruction}`));
  return Object.entries(model?.genes || {}).some(([locus, gene]) => knownConcepts.has(`${locus}:${gene?.instruction || ''}`));
}

async function verifyWorkerEvidence(db, context) {
  const { row, evidence } = context;
  const runId = evidence.executionRunId;
  if (!row.source_agent_id || !runId || !contributionPasses(evidence)) return false;
  if (!(await hasPersistedSuccessfulRun(db, row, runId))) return false;
  return verifyContributionReceipts(db, context);
}

async function hasPersistedSuccessfulRun(db, row, runId) {
  const scope = { organizationId: row.organization_id || null, projectId: row.project_id || null };
  const event = await db.get(
    `SELECT payload_json FROM telemetry_events
      WHERE agent_id = ? AND event_type = 'AGENT_COMPLETED'
        AND organization_id IS ? AND project_id IS ?
        AND json_extract(payload_json, '$.executionRunId') = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    row.source_agent_id, scope.organizationId, scope.projectId, runId
  );
  return Boolean(event && persistedSuccessHasEvidence(event.payload_json));
}

async function verifyContributionReceipts(db, context) {
  const { row, evidence, model } = context;
  const scope = { organizationId: row.organization_id || null, projectId: row.project_id || null };
  for (const [locus, contribution] of Object.entries(evidence.contributionEvidence)) {
    const instruction = model?.genes?.[locus]?.instruction;
    if (contribution?.observed !== true || !instruction
      || !(await hasObservedToolReceipt(db, {
        agentId: row.source_agent_id,
        runId: evidence.executionRunId,
        toolName: instruction,
        scope
      }))) return false;
  }
  return Object.keys(evidence.contributionEvidence).length > 0;
}

function contributionPasses(evidence) {
  const contribution = evidence.contributionEvidence;
  if (!contribution || typeof contribution !== 'object' || Array.isArray(contribution)) return false;
  const entries = Object.values(contribution);
  return entries.length > 0 && entries.every((entry) => entry?.observed === true);
}

function persistedSuccessHasEvidence(payloadJson) {
  try {
    const payload = JSON.parse(payloadJson || '{}');
    return require('./agentEvidenceService').hasDecisionEvidence({ eventType: 'AGENT_COMPLETED', payload });
  } catch (_) {
    return false;
  }
}

async function hasObservedToolReceipt(db, receipt) {
  const { agentId, runId, toolName, scope } = receipt;
  const result = await db.get(
    `SELECT COUNT(*) AS count FROM body_action_receipts r
       JOIN agents a ON a.id = r.agent_id
       LEFT JOIN workspaces w ON w.id = a.workspace_id
      WHERE r.agent_id = ? AND r.run_id = ? AND r.phase = 'observed'
        AND json_extract(r.prediction_json, '$.toolName') = ?
        AND json_extract(r.outcome_json, '$.status') = 'completed'
        AND w.organization_id IS ? AND w.project_id IS ?`,
    agentId, runId, toolName, scope.organizationId, scope.projectId
  );
  return Number(result?.count || 0) > 0;
}

module.exports = { fossilConcepts, hasPersistedTrustedEvidence, normalizeTool };
