'use strict';

/**
 * RecoveryVerification : succès transport != décision valide.
 * Toute recovery exige une vérification indépendante avant HEALTHY.
 */

function verify(opts) {
  const o = opts || {};
  const checks = Array.isArray(o.checks) ? o.checks : [];
  const failed = checks.filter((c) => c.passed === false);
  return {
    verified: failed.length === 0 && checks.length > 0,
    checked: checks.length,
    failed: failed.length,
    at: new Date().toISOString()
  };
}

module.exports = { verify };
