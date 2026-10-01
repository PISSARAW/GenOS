'use strict';

/**
 * @file organizationConsensusService.js
 * @description Agrégation globale en lecture seule (ADR 0236) : snapshot par
 * orchestrateur du quorum local, puis résumé pondéré avec provenance.
 * Aucune écriture, aucune décision contraignante.
 */

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePayload(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function quorumOf(votes, ratio) {
  let active = 0;
  let support = 0;
  let abstentions = 0;
  for (const vote of (votes || [])) {
    if (vote && vote.abstain === true) {
      abstentions += 1;
      continue;
    }
    const weight = num(vote && vote.weight, 1);
    active += weight;
    if (vote && vote.support === true) support += weight;
  }
  return { active, support, abstentions, ratio: num(ratio, 0.5) };
}

async function votesOf(db, orchestratorId) {
  const rows = await db.all(
    "SELECT payload_json as payloadJson FROM agent_organization_messages WHERE orchestrator_id = ? AND delivery = 'delivered' AND kind = 'vote'",
    orchestratorId
  ).catch(() => []);
  return (rows || []).map((row) => {
    const payload = parsePayload(row.payloadJson);
    return { support: payload.support === true, abstain: payload.abstain === true, weight: num(payload.weight, 1) };
  });
}

function supportRatio(parts) {
  if (parts.active <= 0) return 0;
  return Number((parts.support / parts.active).toFixed(3));
}

async function snapshotOf(db, orchestratorId, ratio) {
  const dynamicOrganization = require('./dynamicOrganizationService');
  const state = await dynamicOrganization.getState(db, orchestratorId).catch(() => null);
  const parts = quorumOf(await votesOf(db, orchestratorId), ratio);
  return {
    orchestratorId,
    organization: state ? state.organization : null,
    reached: parts.active > 0 && (parts.support / parts.active) >= ratio,
    support: supportRatio(parts),
    abstentions: parts.abstentions,
    weight: parts.active
  };
}

function summarizeSnapshots(snapshots, ratio) {
  const counted = snapshots.filter((entry) => entry.weight > 0);
  const activeTotal = counted.reduce((sum, entry) => sum + entry.weight, 0);
  const supportTotal = snapshots.reduce((sum, entry) => sum + entry.support * entry.weight, 0);
  const support = activeTotal > 0 ? Number((supportTotal / activeTotal).toFixed(3)) : 0;
  return {
    ratio,
    counted: counted.length,
    orchestrators: snapshots.length,
    support,
    reached: counted.length > 0 && support >= ratio,
    snapshots
  };
}

async function globalQuorumSnapshot(db, quorumRatio) {
  const ratio = num(quorumRatio, 0.5);
  const orchestrators = await db.all("SELECT id FROM agents WHERE execution_mode = 'orchestrator' ORDER BY id").catch(() => []);
  const snapshots = [];
  for (const orchestrator of (orchestrators || [])) {
    snapshots.push(await snapshotOf(db, orchestrator.id, ratio));
  }
  return summarizeSnapshots(snapshots, ratio);
}

module.exports = { globalQuorumSnapshot, quorumOf };
