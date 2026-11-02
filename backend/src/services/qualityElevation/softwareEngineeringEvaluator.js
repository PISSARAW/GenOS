'use strict';
const vm = require('node:vm');
const { textOf, defect, structuralResult } = require('./qualityText');
function securityChecks(code, defects) {
  if (/\.exec\s*\([^,)]*\+/i.test(code)) defects.push(defect('SECURITY_INSECURE_SHELL_EXEC',
    'Concaténation dans exec : contrôle de sécurité requis.', { section: 'security', severity: 'blocker' }));
  if (/(?:api[_-]?key|secret|password)\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']/i.test(code)) defects.push(defect('HARDCODED_SECRET_DETECTED',
    'Secret littéral potentiel : contrôle de sécurité requis.', { section: 'security', severity: 'blocker' }));
}
function evaluateSoftwareEngineering(content, options = {}) {
  const code = textOf(content), defects = [];
  if (!code.trim()) defects.push(defect('EMPTY_ARTIFACT', 'Code absent.', { severity: 'blocker' }));
  // Compile CommonJS/JS without executing it. vm is NOT a security sandbox.
  try { new vm.Script(code); } catch (error) { defects.push(defect('SYNTAX_ERROR', error.message, { section: 'code', severity: 'blocker' })); }
  securityChecks(code, defects);
  for (const name of options.requiredExports || []) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new TypeError('Invalid export identifier.');
    const pattern = new RegExp(`(?:exports\\.${name}\\b|module\\.exports\\s*=\\s*\\{[^}]*\\b${name}\\b)`);
    if (!pattern.test(code)) defects.push(defect('MISSING_REQUIRED_EXPORT', `Export requis absent : ${name}.`));
  }
  const result = structuralResult('software_engineering', code, { defects,
    metrics: { syntaxChecked: true, testsExecuted: false, securityCertified: false } });
  // Inline '// Test: ...' and caller-provided booleans are not executed tests.
  result.requiredExternalVerification = 'behavior_correct';
  return result;
}
module.exports = { evaluateSoftwareEngineering };
