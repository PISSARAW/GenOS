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
  for (const source of sourceUnits(code)) inspectSource(source, defects);
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
function sourceUnits(code) {
  let bundle;
  try { bundle = JSON.parse(code); } catch (_) { return [{ path: 'candidate.js', content: code }]; }
  if (bundle?.schema !== 'genos.quality-code-bundle/v1') return [{ path: 'candidate.js', content: code }];
  if (!Array.isArray(bundle.files) || !bundle.files.length) return [{ path: 'candidate.js', content: '' }];
  return bundle.files;
}
function inspectSource(source, defects) {
  if (typeof source.content !== 'string' || !source.content.trim()) {
    defects.push(defect('EMPTY_ARTIFACT', 'Source absente.', { severity: 'blocker' })); return;
  }
  // Native executed verification remains mandatory for every language.
  if (/\.(?:js|cjs)$/.test(source.path)) {
    try { new vm.Script(source.content); }
    catch (error) { defects.push(defect('SYNTAX_ERROR', error.message, { section: source.path, severity: 'blocker' })); }
  }
  securityChecks(source.content, defects);
}
module.exports = { evaluateSoftwareEngineering };
