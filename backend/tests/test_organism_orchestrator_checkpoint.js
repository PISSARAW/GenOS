const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const checkpoints = require('../src/services/organismOrchestratorCheckpoint');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-orchestrator-reference-'));
  const previous = process.env.GENOS_STUDIO_ROOT;
  const rustMissionId = '00000000-0000-4000-8000-000000000001';
  const directory = path.join(root, 'biological-receipts', `${rustMissionId}.continuity`);
  try {
    process.env.GENOS_STUDIO_ROOT = root;
    await fs.mkdir(directory, { recursive: true });
    const bytes = Buffer.from(JSON.stringify({ seq_id: 7, orchestrator_state: {
      mission_id: rustMissionId, orchestrator: { ready: true } } }));
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const name = `checkpoint-7-${hash}.json`;
    await fs.writeFile(path.join(directory, name), bytes);
    const db = { all: async () => [{ missionId: 'mission-1', rustMissionId, memberCount: 2 }] };
    const references = await checkpoints.capture(db, 'agent-1');
    assert.equal(references.length, 1);
    assert.equal(references[0].shared, true);
    assert.equal(references[0].hash, hash);
    assert.equal(await checkpoints.verify(references), true);
    const laterBytes = Buffer.from(JSON.stringify({ seq_id: 9, orchestrator_state: {
      mission_id: rustMissionId, orchestrator: { ready: true } } }));
    const laterName = `checkpoint-9-${crypto.createHash('sha256').update(laterBytes).digest('hex')}.json`;
    await fs.writeFile(path.join(directory, laterName), laterBytes);
    assert.equal((await checkpoints.latest(rustMissionId)).seq, 9);
    await checkpoints.select(references);
    assert.equal((await checkpoints.latest(rustMissionId)).seq, 7);
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'orchestration.head.json'), 'utf8')).rewound, true);
    await checkpoints.withMissionLocks(references, async () => {
      await assert.rejects(() => checkpoints.withMissionLocks(references, async () => {}),
        { code: 'ORGANISM_MISSION_BUSY' });
    });
    await fs.writeFile(path.join(directory, name), 'corrupt');
    await assert.rejects(() => checkpoints.verify(references), /digest mismatch/);
    await fs.rm(path.join(directory, name));
    await assert.rejects(() => checkpoints.capture(db, 'agent-1'), /head references a missing checkpoint/);
    console.log('Rust checkpoint reference integrity passed.');
  } finally {
    if (previous === undefined) delete process.env.GENOS_STUDIO_ROOT;
    else process.env.GENOS_STUDIO_ROOT = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
