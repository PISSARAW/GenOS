'use strict';

const vm = require('node:vm');

function checkSyntax(code, defects) {
  try {
    new vm.Script(code);
    return 30;
  } catch (err) {
    defects.push({
      code: 'SYNTAX_ERROR',
      severity: 'blocker',
      section: 'code',
      message: `Erreur de syntaxe : ${err.message}`
    });
    return 0;
  }
}

function checkSecurity(code, defects) {
  let score = 25;
  if (/(?:child_process|\bcp|\bsh)\s*\.\s*exec\s*\([^,)]*\+/i.test(code) || /\.exec\s*\([^,)]*\+/i.test(code)) {
    defects.push({
      code: 'SECURITY_INSECURE_SHELL_EXEC',
      severity: 'blocker',
      section: 'security',
      message: 'Concaténation non assainie dans un appel shell exec.'
    });
    score -= 25;
  }
  if (/(?:api[_-]?key|secret|password)\s*[:=]\s*["'][a-zA-Z0-9_\-]{16,}["']/i.test(code)) {
    defects.push({
      code: 'HARDCODED_SECRET_DETECTED',
      severity: 'blocker',
      section: 'security',
      message: 'Secret ou jeton d’authentification codé en dur détecté.'
    });
    score -= 20;
  }
  return Math.max(0, score);
}

function checkRequiredExports(code, requiredExports, defects) {
  if (Array.isArray(requiredExports) && requiredExports.length > 0) {
    let score = 20;
    for (const exp of requiredExports) {
      const hasExport = new RegExp(`\\b(?:exports\\.${exp}|${exp}\\s*[:=]|module\\.exports\\s*=\\s*\\{[^}]*\\b${exp}\\b)`).test(code);
      if (!hasExport) {
        defects.push({
          code: 'MISSING_REQUIRED_EXPORT',
          severity: 'major',
          section: 'interface',
          message: `Symbole ou export requis '${exp}' absent du code.`
        });
        score -= 10;
      }
    }
    return Math.max(0, score);
  }

  const hasAnyExport = /\b(?:module\.exports|export\s+(?:default|const|function|class)|exports\.)\b/.test(code);
  if (!hasAnyExport) {
    defects.push({
      code: 'MISSING_MODULE_EXPORTS',
      severity: 'minor',
      section: 'interface',
      message: 'Aucune exportation de module formelle détectée.'
    });
    return 10;
  }
  return 20;
}

function checkTestResults(code, testResults, defects) {
  if (testResults) {
    let score = 25;
    const failed = Array.isArray(testResults.failed) ? testResults.failed : [];
    if (failed.length > 0) {
      defects.push({
        code: 'UNIT_TEST_FAILURE',
        severity: 'major',
        section: 'tests',
        message: `${failed.length} test(s) unitaire(s) en échec : ${failed.join(', ')}`
      });
      score = Math.max(0, score - (failed.length * 10));
    }
    return score;
  }

  const hasInlineTests = /\b(?:assert|expect|describe|test\s*\()|===/i.test(code);
  if (!hasInlineTests) {
    defects.push({
      code: 'MISSING_TEST_EVIDENCE',
      severity: 'minor',
      section: 'tests',
      message: 'Aucun test unitaire ou assertion exécutable identifiée.'
    });
    return 10;
  }
  return 25;
}

function evaluateSoftwareEngineering(content, options = {}) {
  const code = typeof content === 'string' ? content : (content?.code || content?.candidate || '');
  const defects = [];

  const sSyntax = checkSyntax(code, defects);
  const sSecurity = checkSecurity(code, defects);
  const sExports = checkRequiredExports(code, options.requiredExports, defects);
  const sTests = checkTestResults(code, options.testResults, defects);

  const rawScore = sSyntax + sSecurity + sExports + sTests;
  const score = Math.max(0, Math.min(100, rawScore));
  const blockers = defects.filter((d) => d.severity === 'blocker');
  const minThreshold = options.threshold || 75;
  const passed = score >= minThreshold && blockers.length === 0;

  return {
    domain: 'software_engineering',
    score,
    overallScore: score,
    passed,
    valid: passed,
    threshold: minThreshold,
    defects,
    metrics: {
      syntaxScore: sSyntax,
      securityScore: sSecurity,
      exportsScore: sExports,
      testsScore: sTests,
      blockersCount: blockers.length,
      totalDefectsCount: defects.length
    },
    evaluatedAt: new Date().toISOString()
  };
}

module.exports = {
  evaluateSoftwareEngineering
};
