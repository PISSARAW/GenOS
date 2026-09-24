'use strict';

const store = require('./holobiontStore');

function required(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'HOLOBIONT_PERSISTENT_HOST_INVALID' });
  return text;
}

function availableCapabilities(session) {
  const declared = Array.isArray(session.phenotype?.capabilities) ? session.phenotype.capabilities : [];
  const resident = session.residentSymbionts.flatMap((item) => Array.isArray(item.capabilities) ? item.capabilities : []);
  return new Set([...declared, ...resident]);
}

function capabilityGap(session, requested = []) {
  const available = availableCapabilities(session);
  const requiredCapabilities = Array.isArray(requested) ? requested.map((item) => String(item).trim()).filter(Boolean) : [];
  const missing = [...new Set(requiredCapabilities)].filter((capability) => !available.has(capability));
  return { available: [...available].sort(), required: [...new Set(requiredCapabilities)].sort(), missing };
}

async function findPersistentHost(db, hostId) {
  const row = await db.get(`SELECT holobiont_id FROM holobiont_sessions
    WHERE host_id = ? AND scope = 'PERSISTENT' AND status IN ('ACTIVE', 'QUIESCENT')
    ORDER BY updated_at DESC, holobiont_id LIMIT 1`, hostId);
  return row ? store.getSession(db, row.holobiont_id) : null;
}

async function createPersistentHost(db, input) {
  if (!input.constitution) throw Object.assign(new Error('A Host constitution is required.'), { code: 'HOLOBIONT_CONSTITUTION_REQUIRED' });
  const session = await store.createSession(db, {
    hostId: input.hostId, scope: 'PERSISTENT', constitution: input.constitution,
    constitutionId: input.constitution.constitutionId || null,
    phenotype: { capabilities: Array.isArray(input.capabilities) ? input.capabilities : [] }
  });
  return { session, reused: false };
}

async function attachMission(context) {
  const { db, session, missionId } = context;
  await db.run(`INSERT OR IGNORE INTO holobiont_mission_links (holobiont_id, host_id, mission_id)
    VALUES (?, ?, ?)`, session.holobiontId, session.hostId, missionId);
  const missionHistory = await db.all(`SELECT mission_id AS missionId, attached_at AS attachedAt
    FROM holobiont_mission_links WHERE holobiont_id = ? ORDER BY attached_at, mission_id`, session.holobiontId);
  return { ...session, missionHistory, lastMissionId: missionHistory.at(-1)?.missionId || null };
}

async function openPersistentHost(db, input = {}) {
  const hostId = required(input.hostId, 'hostId');
  const missionId = required(input.missionId, 'missionId');
  let session = await findPersistentHost(db, hostId);
  let reused = true;
  if (!session) {
    ({ session, reused } = await createPersistentHost(db, { ...input, hostId }));
  }
  if (session.status === 'QUIESCENT') {
    const resumed = await store.updateLifecycleStatus(db, {
      holobiontId: session.holobiontId, expectedRevision: session.revision,
      status: 'ACTIVE', eventType: 'RESUMED', payload: { missionId }
    });
    session = await store.getSession(db, session.holobiontId);
    session.revision = resumed.revision;
  }
  session = await attachMission({ db, session, missionId });
  return { session, reused, capabilityGap: capabilityGap(session, input.requiredCapabilities) };
}

module.exports = { openPersistentHost, capabilityGap };
