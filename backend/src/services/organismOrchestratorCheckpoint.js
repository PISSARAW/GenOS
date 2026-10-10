const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { studioBridgeRoot } = require('./genosCliEnv');
const persistedState = require('./organismPersistedState');
const { collectFiles } = require('./workspaceSnapshotCollect');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE = /^checkpoint-(\d+)-([0-9a-f]{64})\.json$/;
const HEAD = 'orchestration.head.json';

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function checkpointDirectory(rustMissionId) {
  if (!UUID.test(rustMissionId)) throw new Error('Rust mission checkpoint identity is invalid.');
  return path.join(studioBridgeRoot(), 'biological-receipts', `${rustMissionId}.continuity`);
}

async function readCheckpoint(directory, name, rustMissionId) {
  const match = FILE.exec(name);
  if (!match) throw new Error('Rust checkpoint file name is invalid.');
  const filePath = path.join(directory, name);
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Rust checkpoint must be a regular file.');
  if (stat.size > 64 * 1024 * 1024) throw new Error('Rust checkpoint exceeds the verification limit.');
  const bytes = await fs.readFile(filePath);
  if (digest(bytes) !== match[2]) throw new Error('Rust checkpoint digest mismatch.');
  const checkpoint = JSON.parse(bytes.toString('utf8'));
  if (checkpoint.seq_id !== Number(match[1])
    || checkpoint.orchestrator_state?.mission_id !== rustMissionId
    || !checkpoint.orchestrator_state?.orchestrator) {
    throw new Error('Rust checkpoint sequence, mission, or restorable state is invalid.');
  }
  return { seq: checkpoint.seq_id, hash: match[2], name, rustMissionId };
}

async function latest(rustMissionId) {
  const directory = checkpointDirectory(rustMissionId);
  const names = await checkpointNames(directory);
  const files = names.filter((name) => name.startsWith('checkpoint-') && name.endsWith('.json'));
  const head = await readHead(directory);
  if (!files.length) {
    if (head) throw new Error('Rust checkpoint head references a missing checkpoint.');
    return null;
  }
  const checkpoints = await Promise.all(files.map((name) => readCheckpoint(directory, name, rustMissionId)));
  assertUniqueSequences(checkpoints);
  if (head) {
    const selected = checkpoints.find((checkpoint) => checkpoint.name === head.name);
    if (!selected) throw new Error('Rust checkpoint head references a missing checkpoint.');
    return selected;
  }
  return checkpoints.sort((left, right) => right.seq - left.seq || right.name.localeCompare(left.name))[0];
}

async function checkpointNames(directory) {
  let names;
  try { names = await fs.readdir(directory); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return names;
}

function assertUniqueSequences(checkpoints) {
  const sequences = new Set();
  for (const checkpoint of checkpoints) {
    if (sequences.has(checkpoint.seq)) throw new Error('Rust checkpoint sequence is ambiguous.');
    sequences.add(checkpoint.seq);
  }
}

async function readHead(directory) {
  let bytes;
  try {
    const target = path.join(directory, HEAD);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Rust checkpoint head must be a regular file.');
    if (stat.size > 4096) throw new Error('Rust checkpoint head exceeds the verification limit.');
    bytes = await fs.readFile(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const head = JSON.parse(bytes.toString('utf8'));
  if (!FILE.test(head?.name) || (head.rewound !== undefined && typeof head.rewound !== 'boolean')) {
    throw new Error('Rust checkpoint head is invalid.');
  }
  return head;
}

async function withMissionLocks(references, action) {
  const ids = [...new Set(references.map((item) => item.rustMissionId))].sort();
  const held = [];
  try {
    for (const id of ids) {
      const lockPath = path.join(path.dirname(checkpointDirectory(id)), `${id}.lock`);
      const handle = await fs.open(lockPath, 'wx').catch((error) => {
        if (error.code === 'EEXIST') throw Object.assign(new Error('Rust mission is busy or its lock requires operator recovery.'), { code: 'ORGANISM_MISSION_BUSY', status: 409 });
        throw error;
      });
      held.push({ handle, lockPath });
    }
    return await action();
  } finally {
    for (const item of held.reverse()) {
      await item.handle.close();
      await fs.unlink(item.lockPath);
    }
  }
}

async function linkedMissions(db, agentId) {
  return db.all(`SELECT ma.mission_id AS missionId, bem.rust_mission_id AS rustMissionId,
    (SELECT COUNT(*) FROM mission_agents peers WHERE peers.mission_id = ma.mission_id) AS memberCount
    FROM mission_agents ma JOIN biological_execution_missions bem ON bem.mission_id = ma.mission_id
    WHERE ma.agent_id = ? ORDER BY ma.mission_id`, agentId);
}

async function peerFingerprint(db, agentId, scope) {
  const agent = await db.get(`SELECT a.* FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.id = ? AND ${scope.clause}`, agentId, ...scope.params);
  if (!agent || agent.runtime_pid || require('./agentOrchestrationState').activeProcesses.has(agentId)) {
    throw Object.assign(new Error('Shared Rust mission peer is unavailable or active.'), { code: 'ORGANISM_SHARED_PEER_ACTIVE', status: 409 });
  }
  const persisted = await persistedState.capture(db, agentId, scope);
  if (persisted.sections.modelTurns.some((turn) => turn.status === 'pending')) {
    throw Object.assign(new Error('Shared Rust mission peer has pending inference.'), { code: 'ORGANISM_SHARED_PEER_MODEL_PENDING', status: 409 });
  }
  const workspace = agent.workspace_id
    ? await db.get(`SELECT w.path FROM workspaces w WHERE w.id = ? AND ${scope.clause}`, agent.workspace_id, ...scope.params)
    : null;
  if (agent.workspace_id && !workspace?.path) throw new Error('Shared peer workspace is unavailable.');
  const files = workspace ? await collectFiles(workspace.path) : null;
  return digest(JSON.stringify({ agent, persisted: persisted.hash, files }));
}

async function peersFor(db, options) {
  const { missionId, agentId, scope } = options;
  const rows = await db.all('SELECT agent_id AS agentId FROM mission_agents WHERE mission_id = ? AND agent_id <> ? ORDER BY agent_id', missionId, agentId);
  const peers = [];
  for (const row of rows) peers.push({ agentId: row.agentId,
    hash: await peerFingerprint(db, row.agentId, scope) });
  return peers;
}

async function capture(db, agentId, options = {}) {
  const missions = await linkedMissions(db, agentId);
  const collect = async () => {
    const references = [];
    for (const mission of missions) {
      const checkpoint = await latest(mission.rustMissionId);
      if (!checkpoint) {
        throw Object.assign(new Error('Linked Rust mission has no verifiable checkpoint.'),
          { code: 'ORGANISM_ORCHESTRATOR_CHECKPOINT_MISSING', status: 409 });
      }
      const peers = mission.memberCount > 1 && options.scope
        ? await peersFor(db, { missionId: mission.missionId, agentId, scope: options.scope }) : undefined;
      references.push({ ...checkpoint, missionId: mission.missionId,
        shared: mission.memberCount !== 1, ...(peers ? { peers } : {}) });
    }
    return references;
  };
  return options.locked ? collect() : withMissionLocks(missions, collect);
}

async function verify(references) {
  if (!Array.isArray(references)) return false;
  for (const reference of references) {
    if (!reference || !UUID.test(reference.rustMissionId) || !FILE.test(reference.name)) return false;
    const actual = await readCheckpoint(checkpointDirectory(reference.rustMissionId), reference.name,
      reference.rustMissionId);
    if (actual.seq !== reference.seq || actual.hash !== reference.hash) return false;
  }
  return true;
}

async function select(references, rewound = true) {
  for (const reference of references) {
    const directory = checkpointDirectory(reference.rustMissionId);
    const current = await readHead(directory);
    const selectedRewound = reference.rewound ?? rewound;
    if (current?.name === reference.name && Boolean(current.rewound) === selectedRewound) continue;
    const temporary = path.join(directory, `.head-${crypto.randomUUID()}.tmp`);
    const handle = await fs.open(temporary, 'wx');
    try {
      await handle.writeFile(JSON.stringify({ name: reference.name, rewound: selectedRewound }));
      await handle.sync();
    } finally { await handle.close(); }
    try { await fs.rename(temporary, path.join(directory, HEAD)); } catch (error) {
      await fs.unlink(temporary).catch(() => {});
      throw error;
    }
  }
}

async function active(references) {
  const result = [];
  for (const reference of references) {
    const head = await readHead(checkpointDirectory(reference.rustMissionId));
    const selected = await latest(reference.rustMissionId);
    result.push({ ...selected, rewound: Boolean(head?.rewound) });
  }
  return result;
}

async function assertCoherent(db, options) {
  const { agentId, references, scope } = options;
  const mapped = await linkedMissions(db, agentId);
  if (JSON.stringify(mapped.map((item) => item.rustMissionId).sort())
    !== JSON.stringify(references.map((item) => item.rustMissionId).sort())) {
    throw Object.assign(new Error('Rust mission set differs from the snapshot.'), { code: 'ORGANISM_MISSION_MAPPING_CHANGED', status: 409 });
  }
  for (const reference of references) {
    const row = await db.get(`SELECT bem.rust_mission_id AS rustMissionId,
      (SELECT COUNT(*) FROM mission_agents peers WHERE peers.mission_id = ma.mission_id) AS memberCount
      FROM mission_agents ma JOIN biological_execution_missions bem ON bem.mission_id = ma.mission_id
      WHERE ma.agent_id = ? AND ma.mission_id = ?`, agentId, reference.missionId);
    if (!row || row.rustMissionId !== reference.rustMissionId) {
      throw Object.assign(new Error('Rust mission mapping changed after snapshot.'), { code: 'ORGANISM_MISSION_MAPPING_CHANGED', status: 409 });
    }
    if (row.memberCount > 1) {
      if (!Array.isArray(reference.peers) || reference.peers.length !== row.memberCount - 1) {
        throw Object.assign(new Error('Shared Rust mission cohort is missing from snapshot.'), { code: 'ORGANISM_SHARED_MISSION_RESTORE_REQUIRED', status: 409 });
      }
      const current = await peersFor(db, { missionId: reference.missionId, agentId, scope });
      if (JSON.stringify(current) !== JSON.stringify(reference.peers)) {
        throw Object.assign(new Error('Shared Rust mission peers changed after snapshot.'), { code: 'ORGANISM_SHARED_PEER_CHANGED', status: 409 });
      }
    }
  }
}

module.exports = { capture, verify, latest, select, active, assertCoherent, linkedMissions, withMissionLocks };
