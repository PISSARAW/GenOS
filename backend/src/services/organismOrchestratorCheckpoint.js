const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { studioBridgeRoot } = require('./genosCliEnv');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE = /^checkpoint-(\d+)-([0-9a-f]{64})\.json$/;

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
  let names;
  try { names = await fs.readdir(directory); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const files = names.filter((name) => FILE.test(name));
  if (!files.length) return null;
  const checkpoints = await Promise.all(files.map((name) => readCheckpoint(directory, name, rustMissionId)));
  const sequences = new Set();
  for (const checkpoint of checkpoints) {
    if (sequences.has(checkpoint.seq)) throw new Error('Rust checkpoint sequence is ambiguous.');
    sequences.add(checkpoint.seq);
  }
  return checkpoints.sort((left, right) => right.seq - left.seq || right.name.localeCompare(left.name))[0];
}

async function capture(db, agentId) {
  const missions = await db.all(`SELECT ma.mission_id AS missionId, bem.rust_mission_id AS rustMissionId,
    (SELECT COUNT(*) FROM mission_agents peers WHERE peers.mission_id = ma.mission_id) AS memberCount
    FROM mission_agents ma JOIN biological_execution_missions bem ON bem.mission_id = ma.mission_id
    WHERE ma.agent_id = ? ORDER BY ma.mission_id`, agentId);
  const references = [];
  for (const mission of missions) {
    const checkpoint = await latest(mission.rustMissionId);
    if (!checkpoint) {
      throw Object.assign(new Error('Linked Rust mission has no verifiable checkpoint.'),
        { code: 'ORGANISM_ORCHESTRATOR_CHECKPOINT_MISSING', status: 409 });
    }
    references.push({ ...checkpoint, missionId: mission.missionId,
      shared: mission.memberCount !== 1 });
  }
  return references;
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

module.exports = { capture, verify, latest };
