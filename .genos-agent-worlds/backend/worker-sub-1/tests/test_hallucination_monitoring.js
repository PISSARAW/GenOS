const assert = require('assert');
const { inspectEvent, recordObservation, evidencePresent } = require('../src/services/hallucinationMonitoringService');

async function main() {
  console.log('=== Test Suite : Détection des affirmations non prouvées & Monitoring ===');

  // --- 1. Validation unitaire de evidencePresent ---
  console.log('1. Test de robustesse de evidencePresent...');
  assert.strictEqual(evidencePresent(null), false, 'null doit être rejeté');
  assert.strictEqual(evidencePresent(undefined), false, 'undefined doit être rejeté');
  assert.strictEqual(evidencePresent(''), false, 'Chaîne vide doit être rejetée');
  assert.strictEqual(evidencePresent('   '), false, 'Espaces blancs doivent être rejetés');
  assert.strictEqual(evidencePresent([]), false, 'Tableau vide doit être rejeté');
  assert.strictEqual(evidencePresent(['', '   ']), false, 'Tableau de chaînes vides doit être rejeté');
  assert.strictEqual(evidencePresent([null, undefined]), false, 'Tableau de nulls doit être rejeté');
  assert.strictEqual(evidencePresent([{}]), false, 'Tableau d\'objets vides doit être rejeté');
  assert.strictEqual(evidencePresent('TODO: implement proof'), false, 'Placeholder TODO doit être rejeté');
  assert.strictEqual(evidencePresent(['none']), false, 'Placeholder none doit être rejeté');
  assert.strictEqual(evidencePresent(['N/A']), false, 'Placeholder N/A doit être rejeté');
  assert.strictEqual(evidencePresent(['unverified claim']), false, 'Placeholder unverified claim doit être rejeté');
  assert.strictEqual(evidencePresent(['sujet de secours']), false, 'Placeholder sujet de secours doit être rejeté');

  assert.strictEqual(evidencePresent('Valid text evidence statement'), true, 'Preuve textuelle valide acceptée');
  assert.strictEqual(evidencePresent(['receipt-hash-abc']), true, 'Preuve en tableau acceptée');
  assert.strictEqual(evidencePresent({ hash: 'sha256:123', status: 'verified' }), true, 'Preuve sous forme d\'objet structuré acceptée');
  assert.strictEqual(evidencePresent([{ receiptId: 'tx-999' }]), true, 'Tableau d\'objets de preuve accepté');
  console.log('-> ✅ PASS: evidencePresent filtre rigoureusement les faux reçus et placeholders');

  // --- 2. Inspection des événements directs et imbriqués ---
  console.log('2. Test de inspectEvent sur claims directes et imbriquées...');
  const validDirect = inspectEvent({ eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'verified', evidence: ['receipt-1'] }] } });
  assert.deepStrictEqual(validDirect, { detected: false, count: 0, reasons: [] });

  const unprovenDirect = inspectEvent({ eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'unsupported' }] } });
  assert.strictEqual(unprovenDirect.detected, true);
  assert.match(unprovenDirect.reasons[0], /lack evidence/);

  // Contournement par tableau creux ou placeholder
  const hollowArray = inspectEvent({ eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'fake', evidence: ['   '] }] } });
  assert.strictEqual(hollowArray.detected, true, 'Un tableau contenant des espaces blancs doit être détecté comme non prouvé');

  const placeholderClaim = inspectEvent({ eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'fake', evidence: ['TODO: add proof later'] }] } });
  assert.strictEqual(placeholderClaim.detected, true, 'Un placeholder doit être détecté comme non prouvé');

  // Support des receipts et sourceRefs
  const receiptClaim = inspectEvent({ eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'c1', receipts: ['tx-123'] }] } });
  assert.strictEqual(receiptClaim.detected, false, 'receipts valides ne doivent pas déclencher d\'alerte');

  const sourceRefClaim = inspectEvent({ eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'c2', sourceRefs: ['file.js#L10'] }] } });
  assert.strictEqual(sourceRefClaim.detected, false, 'sourceRefs valides ne doivent pas déclencher d\'alerte');

  // Affirmations imbriquées dans evidenceReport (worker reports)
  const nestedReport = inspectEvent({
    eventType: 'WORKER_TASK_COMPLETED',
    payload: {
      evidenceReport: {
        claims: [
          { statement: 'Valid claim', evidence: ['receipt-nested'] },
          { statement: 'Unproven nested claim', evidence: [] }
        ],
        unverifiedClaims: ['Rapport incomplet']
      }
    }
  });
  assert.strictEqual(nestedReport.detected, true, 'Les claims imbriquées dans evidenceReport doivent être inspectées');
  assert.ok(nestedReport.reasons.some((r) => r.includes('lack evidence') || r.includes('explicitly lack evidence')));

  // Proposals de code
  const failedProposal = inspectEvent({ eventType: 'AGENT_COMPLETED', payload: { proposal: { proposal: { evidence: 'ran test' }, tests: [{ exitCode: 1 }] } } });
  assert.strictEqual(failedProposal.detected, true);
  console.log('-> ✅ PASS: inspectEvent intercepte les affirmations directes, imbriquées et proposals');

  // --- 3. Enregistrement en base de données ---
  console.log('3. Test de recordObservation et incrément en base...');
  const state = { monitoring: 1, count: 0 };
  const db = {
    async get(sql) { return sql.includes('hallucination_monitoring') ? { hallucination_monitoring: state.monitoring } : { hallucination_count: state.count }; },
    async run(_sql, count) { state.count += count; }
  };
  const first = await recordObservation(db, { agentId: 'agent-1', eventType: 'UNVERIFIED_CLAIM', payload: {} });
  assert.strictEqual(first.total, 1);
  const second = await recordObservation(db, { agentId: 'agent-1', eventType: 'AGENT_STEP', payload: { claims: [{ statement: 'missing receipt' }] } });
  assert.strictEqual(second.total, 2);
  state.monitoring = 0;
  const disabled = await recordObservation(db, { agentId: 'agent-1', eventType: 'UNVERIFIED_CLAIM', payload: {} });
  assert.strictEqual(disabled.monitored, false);
  assert.strictEqual(state.count, 2);
  console.log('-> ✅ PASS: recordObservation enregistre et respecte le flag hallucination_monitoring');

  console.log('\n========================================================================');
  console.log('  TOUS LES TESTS DE DÉTECTION DES AFFIRMATIONS NON PROUVÉES ONT RÉUSSI !');
  console.log('========================================================================');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

