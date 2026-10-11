'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { VARIANTS, assess } = require('../src/services/trinityNominalQualification');
const agentGit = require('../src/services/agentGitService');
const comparisonJournal = require('../src/services/trinityNominalComparisonJournal');

function manifestAt(filename) {
  const entries = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!entries || Array.isArray(entries) || typeof entries !== 'object'
    || Object.keys(entries).length !== VARIANTS.length
    || VARIANTS.some((variant) => typeof entries[variant] !== 'string' || !entries[variant].trim())
    || new Set(Object.values(entries)).size !== VARIANTS.length) {
    throw new Error('Manifest must map each of the 12 Trinity variants to a distinct mission ID.');
  }
  return entries;
}

async function inspect(db, variant, missionId) {
  const experiment = await db.get('SELECT id, mission_id, mission_snapshot_hash, status, decision_json FROM trinity_experiments WHERE mission_id = ?', missionId);
  const [dispatch, worlds, transitions, comparisonProof] = await Promise.all([
    db.get('SELECT variant_selection_json FROM trinity_dispatch_configs WHERE mission_id = ?', missionId),
    db.all('SELECT world_number, agent_id, status, snapshot_hash, workspace_root FROM trinity_worlds WHERE experiment_id = ? ORDER BY world_number', experiment?.id || null),
    db.all('SELECT from_status, to_status, actor, evidence_ref FROM trinity_experiment_transitions WHERE experiment_id = ? ORDER BY id', experiment?.id || null),
    comparisonJournal.read(db, missionId)
  ]);
  let signedObjectValid = false;
  if (experiment?.decision_json) {
    let decision = {};
    try { decision = JSON.parse(experiment.decision_json); } catch (_) {}
    if (decision.agentGit?.objectId) {
      const object = await db.get('SELECT * FROM agent_git_objects WHERE id = ?', decision.agentGit.objectId);
      try { signedObjectValid = signedCandidateObject({ object, experiment, decision }); } catch (_) {}
    }
  }
  return assess({ variant, missionId, experiment, dispatch, worlds, transitions, comparisonProof, signedObjectValid });
}

function signedCandidateObject(input) {
  const { object, experiment, decision } = input;
  if (!object || !agentGit.verifyObjectSignature(object)) return false;
  const metadata = agentGit.json(object.metadata_json, {});
  return metadata.experimentId === experiment.id && metadata.worldNumber === decision.worldNumber
    && metadata.contentHash === decision.verification?.contentHash
    && metadata.candidateWorkspaceId === decision.artifact?.candidateWorkspaceId
    && object.commit_hash === decision.agentGit?.commitHash;
}

async function main() {
  const [databasePath, manifestPath] = process.argv.slice(2);
  if (!databasePath || !manifestPath) throw new Error('Usage: node trinity-nominal-campaign.cjs <database.sqlite> <manifest.json>');
  const entries = manifestAt(path.resolve(manifestPath));
  const db = await open({ filename: path.resolve(databasePath), driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    const results = [];
    for (const variant of VARIANTS) results.push(await inspect(db, variant, entries[variant]));
    process.stdout.write(JSON.stringify({ schema: 'genos.trinity.nominal-campaign/v1',
      qualified: results.filter((result) => result.qualified).length,
      total: results.length, results }, null, 2) + '\n');
    if (results.some((result) => !result.qualified)) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 2; });

module.exports = { inspect, manifestAt, signedCandidateObject };
