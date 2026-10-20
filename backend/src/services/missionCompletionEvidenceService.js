'use strict';

const store = require('./biologicalWorkerStore');

function memberId(member) {
  return member?.memberId || member?.workerId || null;
}

function normalizeMembers(members) {
  return (Array.isArray(members) ? members : []).map((member) => ({ ...member,
    memberId: memberId(member), evidenceRefs: [] }));
}

function proofFromRow(row) {
  try {
    const content = store.verifiedJson(row, 'receipt_json');
    return { reference: `sha256:${row.payload_hash}`, content,
      source: 'biological_worker_receipts' };
  } catch {
    return null;
  }
}

async function persistedProofs(db, missionId) {
  if (!db || !missionId) return [];
  await store.ensure(db);
  const rows = await db.all(`SELECT * FROM biological_worker_receipts
    WHERE mission_id = ? ORDER BY rowid DESC`, missionId);
  return rows.map(proofFromRow).filter(Boolean);
}

function attachProofs(members, proofs) {
  const byMember = new Map();
  for (const proof of proofs) {
    const id = proof.content?.workerId || proof.content?.memberId;
    if (!id || byMember.has(id)) continue;
    byMember.set(id, proof.reference);
  }
  return members.map((member) => ({ ...member,
    evidenceRefs: byMember.has(member.memberId) ? [byMember.get(member.memberId)] : [] }));
}

async function collect(input = {}) {
  const members = normalizeMembers(input.members);
  const supplied = Array.isArray(input.evidenceProofs) ? input.evidenceProofs : [];
  const persisted = await persistedProofs(input.db, input.missionId);
  const evidenceProofs = input.db ? persisted : supplied;
  return { members: attachProofs(members, evidenceProofs), evidenceProofs };
}

module.exports = { collect, proofFromRow };
