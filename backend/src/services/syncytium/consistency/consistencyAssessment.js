'use strict';

const evaluator = require('../invariants/invariantEvaluator');

function assessConsistency(session) {
  const snapshot = session.crdt.getSnapshot();
  const receipts = evaluator.evaluateAll(session.schema?.invariants || {}, snapshot.sharedFields);
  const failed = snapshot.invariants.filter((invariant) => !invariant.passed).map((item) => item.name);
  const blocking = receipts.filter((receipt) => !receipt.passed && receipt.severity !== 'WARNING');
  const failedInvariants = [...new Set([...failed, ...blocking.map((item) => item.invariantId)])];
  const membranePotentialMv = session.cytoplasm.snapshotState().membranePotentialMv;
  return {
    verdict: failedInvariants.length ? 'divergent' : 'consistent', failedInvariants,
    invariantReceipts: receipts, membranePotentialMv,
    physiology: membranePotentialMv < -85 || membranePotentialMv > 30 ? 'unstable' : 'normal',
    step: snapshot.step, totalOps: snapshot.totalOps, textLength: snapshot.textContent.length
  };
}

module.exports = { assessConsistency };
