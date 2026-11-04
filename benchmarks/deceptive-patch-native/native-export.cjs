'use strict';
const fs = require('node:fs');
const path = require('node:path');
const storage = require('../../backend/src/services/gqwf/storage');
const {readBlob} = require('../../backend/src/services/gqwf/objects');

function toolOutcome(directory) {
  const saved = JSON.parse(fs.readFileSync(directory + '/mcp-result.json', 'utf8'));
  if (saved.isError === true) return {success: false, reason: 'native_tool_refused'};
  const text = saved.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  try {return JSON.parse(text);} catch (_) {return {success: false, reason: 'native_domain_result_unparsed'};}
}

async function exportRoot(db, options, session) {
  const workspace = await storage.workspace(db, session.workspace_id);
  const manifest = await storage.root(db, session.workspace_id, session.candidate_hash);
  const destination = options.directory + '/native-candidate';
  fs.mkdirSync(destination);
  for (const entry of manifest.files) {
    const target = require('../../backend/src/services/pathSafety').resolveContainedPathNoSymlinkSync(destination,
      entry.path, 'benchmark export');
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, await readBlob(workspace.path, entry.hash));
  }
  return {directory: destination, rootHash: session.candidate_hash, files: manifest.files};
}

async function loadEvidence(db, options) {
  const identity = JSON.parse(fs.readFileSync(options.directory + '/identity.json', 'utf8'));
  const run = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', identity.orchestratorId);
  const outcome = toolOutcome(options.directory);
  if (!run) return {outcome};
  const session = await db.get('SELECT * FROM gqwf_execution_sessions WHERE execution_run_id=?', run.id);
  const inspection = await require('../../backend/src/services/epistemic/nativeOracleInspection')
    .inspect(db, {runId: run.id, agentId: identity.orchestratorId});
  return {run, outcome, session, inspection, quality: await loadQuality(db, run.id)};
}

async function loadQuality(db, runId) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='gqel_quality_receipts'");
  if (!table) return null;
  const row = await db.get('SELECT contract_digest FROM gqel_quality_receipts WHERE run_id=?', runId);
  return row ? require('../../backend/src/services/qualityElevation/qualityReceiptStore')
    .get(db, {runId, contractDigest: row.contract_digest}) : null;
}

function eligible(evidence, artifact) {
  return [evidence.outcome.success === true, evidence.run?.status === 'completed',
    evidence.inspection?.status === 'accepted_at_decision', evidence.quality?.receipt.evaluation.passed === true,
    Boolean(artifact), evidence.session?.outcome === 'completed'].every(Boolean);
}

async function qualify(db, options) {
  const evidence = await loadEvidence(db, options);
  const {run, outcome, session, inspection, quality} = evidence;
  const artifact = session?.candidate_hash ? await exportRoot(db, options, session) : null;
  const binding = artifact ? await require('./export-binding.cjs').verify(db, {run, artifact}) : null;
  const accepted = eligible(evidence, artifact) && binding?.matched === true;
  const final = options.directory + '/final';
  if (accepted) fs.cpSync(artifact.directory, final, {recursive: true});
  else copyInitial(options.workspace, final);
  return {accepted, ...qualificationView(evidence), binding, artifact};
}

function qualificationView(evidence) {
  const {run, outcome, inspection, quality} = evidence;
  return {runId: run?.id || null, runStatus: run?.status || null,
    domainSuccess: outcome.success === true, verdict: outcome.verdict || outcome.reason || null,
    oracle: inspection || null, qualityReceiptId: quality?.receipt.receiptId || null,
    qualityPassed: quality?.receipt.evaluation.passed === true};
}

function copyInitial(workspace, final) {
  fs.mkdirSync(final);
  for (const entry of fs.readdirSync(workspace, {withFileTypes: true})) {
    if (entry.isFile() && !entry.name.startsWith('.')) fs.copyFileSync(path.join(workspace, entry.name), path.join(final, entry.name));
  }
}
module.exports = {qualify, toolOutcome, copyInitial};
