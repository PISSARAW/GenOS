const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { getDatabase, closeDatabase } = require('../src/db');
const strategyContracts = require('../src/services/strategyContractService');
const strategyService = require('../src/services/strategyExecutionService');
const telemetry = require('../src/services/telemetryObserver');
const { buildGateContext } = require('../src/services/promotionGateContext');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'test-admin-password-approve-run';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET || 'test-epistemic-receipt-approve-run';

async function run() {
  const reportOnlyContext = buildGateContext({
    promotion: { report: { epistemicAssembly: { trustedVerifierDigests: ['caller-controlled'] } } },
    options: {}, receipt: null, aeisEvaluation: { assembly: null }
  });
  assert.equal(reportOnlyContext.epistemicAssembly, null, 'caller reports cannot supply the trusted AEIS assembly');
  const dbPath = path.join(os.tmpdir(), `genos-aeis-approve-${process.pid}.db`);
  const proofWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-aeis-promotion-proof-'));
  for (const replica of ['a', 'b']) {
    const cwd = path.join(proofWorkspace, replica);
    fs.mkdirSync(cwd);
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({
      name: `genos-aeis-promotion-proof-${replica}`, version: '1.0.0', scripts: { test: 'node verify.js' }
    }));
    fs.writeFileSync(path.join(cwd, 'verify.js'), replica === 'a'
      ? "process.stdout.write('promotion-proof\\n');\n"
      : "process.stdout.write(['promotion', 'proof'].join('-') + '\\n');\n");
  }
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);

  try {
    const emittedEvents = [];
    const onTelemetry = (evt) => {
      emittedEvents.push(evt);
    };
    telemetry.on('telemetry', onTelemetry);

    await db.run("INSERT INTO workspaces (id, name, path) VALUES ('ws-aeis-promo', 'AEIS promotion', ?)", proofWorkspace);
    await db.run("INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('agent-promo-test', 'Promo Agent', 'orchestrator', 'running', 'orchestrator', 'ws-aeis-promo')");
    const contractRecord = await strategyContracts.saveContract(db, {
      agentId: 'agent-promo-test',
      problem: 'High risk mission requiring human approval'
    });

    const contract = contractRecord.contract;
    contract.promotion.require_human_approval = true;
    const hash = strategyContracts.hashContract(contract);
    await db.run('UPDATE strategy_contracts SET contract_json = ?, contract_hash = ? WHERE id = ?', JSON.stringify(contract), hash, contractRecord.id);

    const run = await strategyService.createExecutionRun(db, {
      agentId: 'agent-promo-test',
      contractRecord: { ...contractRecord, contract },
      budget: { tokens: 10000, costUsd: 1, latencyMs: 30000, events: 50 }
    });

    await db.run("UPDATE strategy_execution_runs SET status = 'awaiting_approval' WHERE id = ?", run.id);
    await db.run("UPDATE strategy_execution_steps SET status = 'awaiting_approval' WHERE run_id = ? AND sequence = 7", run.id);

    await assert.rejects(
      strategyService.approveRun(db, run.id),
      /cannot be promoted without an evidence report/
    );
    assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', run.id)).status, 'awaiting_approval');

    await assert.rejects(() => strategyService.approveRun(db, run.id, {
      approvedBy: 'security_auditor',
      summary: 'Promotion audited and approved for production readiness.',
      report: { outcome: 'success', claims: [{ statement: 'Promotion audited', evidence: ['security-review'] }] },
      humanApprovalReceipt: {
        approved: true,
        approvalId: `approval-${run.id}`,
        approverId: 'security_auditor',
        approvedAt: new Date().toISOString(),
        payloadHash: contractRecord.contract_hash || '0'.repeat(64)
      }
    }), /independent verification|epistemic assurance|proof_verification/i);
    assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', run.id)).status, 'awaiting_approval', 'unsigned evidence must not finalize promotion');
    assert.equal(emittedEvents.some((event) => event.eventType === 'STRATEGY_PROMOTION_FINALIZED'), false);

    const positive = await approveWithRealEvidence({ db, run, contractRecord, proofWorkspace });
    const { approvedRun, realReport } = positive;
    assert.equal(approvedRun.status, 'completed', 'genuine signed independent AEIS receipts must allow approval');
    const learned = await db.get("SELECT * FROM epistemic_immune_memory_scoped WHERE scope_id = 'local:local:ws-aeis-promo'");
    assert.equal(learned?.successes, 1, 'a validated promotion must resolve the immune outcome');
    assert.equal(learned?.pending, 0);
    assert.equal(learned?.affinity, 1);
    const stored = await db.get('SELECT id FROM aeis_assurance_assemblies ORDER BY rowid DESC LIMIT 1');
    const persisted = await require('../src/services/aeisAssemblyStore').readAssembly(db, stored.id);
    const repeated = await require('../src/services/epistemic/immuneMemoryRepository').resolve(db, {
      scopeId: 'local:local:ws-aeis-promo', signature: learned.signature,
      assemblyId: stored.id, runId: run.id,
      resultId: persisted.evaluation.assembly.results[0].resultId, test: realReport.claims[0].test,
    });
    assert.equal(repeated, false, 'a retried run cannot increase affinity twice');
    const proofEvaluation = await require('../src/services/epistemic/aeisPromotionBridge').evaluateReportWithAeis(realReport, {
      trustedVerifierDigests: require('../src/services/verifierTrustRegistry').listVerifierDigests(),
      allowedWorkspaceRoot: proofWorkspace,
    });
    assertPositiveAssembly(proofEvaluation);

    telemetry.off('telemetry', onTelemetry);
    console.log('✅ approveRun rejects unsigned evidence and accepts two genuine independent AEIS receipts.');
  } finally {
    await closeDatabase();
    fs.rmSync(proofWorkspace, { recursive: true, force: true });
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }
}

async function approveWithRealEvidence(spec) {
  const { db, run, contractRecord, proofWorkspace } = spec;
  const realReport = {
    outcome: 'success',
    claims: [{
      statement: 'npm test exits with code 0',
      evidence: [{ kind: 'reproducible_artifact', content: { fixture: 'promotion-e2e' } }],
      test: { command: 'npm test', replicas: {
        proof: { cwd: path.join(proofWorkspace, 'a') },
        source: { cwd: path.join(proofWorkspace, 'b') },
      } }
    }]
  };
  const approvedRun = await strategyService.approveRun(db, run.id, {
    report: realReport,
    humanApprovalReceipt: {
      approved: true, approvalId: `approval-${run.id}`, approverId: 'security_auditor',
      approvedAt: new Date().toISOString(), payloadHash: contractRecord.contract_hash || '0'.repeat(64)
    }
  });
  return { approvedRun, realReport };
}

function assertPositiveAssembly(proofEvaluation) {
  assert.equal(proofEvaluation.evaluation.eligible, true, 'the AEIS assembly must satisfy all assurance obligations');
  const receipts = proofEvaluation.assembly.verifications.filter((receipt) => receipt.independent === true);
  assert.ok(receipts.length >= 2, 'AEIS must collect two independent verifier receipts');
  assert.equal(new Set(receipts.map((receipt) => receipt.independenceDescriptor.actorId)).size, receipts.length,
    'independent receipts must identify distinct verifier actors');
  assertVerifiedReceipts(receipts, proofEvaluation.assembly.results);
}

function assertVerifiedReceipts(receipts, results) {
  const trustedDigests = require('../src/services/verifierTrustRegistry').listVerifierDigests();
  const validateReceipt = require('../src/services/epistemicVerifierReceiptService').validateReceipt;
  const resultsById = new Map(results.map((result) => [result.resultId, result]));
  assert.ok(receipts.every((receipt) => receipt.status === 'verified' && receipt.signature && receipt.resultId
    && receipt.evidenceDigest === resultsById.get(receipt.resultId)?.evidence.digest
    && receipt.coveredObligations?.includes(receipt.resultId)
    && validateReceipt(receipt, trustedDigests)),
  'each receipt must be signed, trusted, evidence-bound, and obligation-bound');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
