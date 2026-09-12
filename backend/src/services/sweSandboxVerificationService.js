/**
 * SWE Sandbox Verification Service — Cerebellar Motor Error & p53 Checkpoint Gate.
 *
 * Implémente :
 * 1. Le Cervelet et la Boucle d'Erreur Motrice :
 *    Analyse les erreurs d'exécution pour fournir un signal de correction motrice.
 * 2. Le Checkpoint Cellulaire p53 :
 *    Barrière de preuve avant promotion : empêche l'intégration de patches syntaxiquement corrompus.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SweSandboxVerificationService {
  constructor(options = {}) {
    this.scratchDir = options.scratchDir || path.resolve(process.cwd(), '.genos', 'workspace', 'sandbox');
    try {
      if (!fs.existsSync(this.scratchDir)) fs.mkdirSync(this.scratchDir, { recursive: true });
    } catch (_) {}
  }

  /**
   * Vérifie la validité syntaxique d'un code Python (max 3 params)
   */
  verifyPythonSyntax(codeString, filename = 'test_patch.py') {
    const tmpFile = path.join(this.scratchDir, filename);
    fs.writeFileSync(tmpFile, codeString, 'utf8');

    try {
      // Validation syntaxique native via py_compile
      execSync(`python -m py_compile "${tmpFile}"`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: 'pipe'
      });
      return {
        syntaxValid: true,
        filename,
        error: null,
        p53Status: 'PASSED'
      };
    } catch (err) {
      const errMsg = (err.stderr || err.stdout || err.message).toString();
      const lineMatch = errMsg.match(/line (\d+)/i);
      return {
        syntaxValid: false,
        filename,
        error: errMsg.trim(),
        faultLine: lineMatch ? Number(lineMatch[1]) : null,
        p53Status: 'BLOCKED_APOPTOSIS'
      };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
    }
  }

  /**
   * Évalue le patch dans un environnement simulé ou réel (max 3 params)
   */
  evaluatePatchExecution(patchStr, options = {}) {
    if (!patchStr || typeof patchStr !== 'string' || !patchStr.trim()) {
      return {
        success: false,
        p53Passed: false,
        error: 'Empty or missing patch string'
      };
    }

    // 1. Extraction et dédentation des lignes ajoutées dans le diff pour contrôle syntaxique
    const rawLines = patchStr
      .split('\n')
      .filter(l => l.startsWith('+') && !l.startsWith('+++'))
      .map(l => l.slice(1));
    const nonBlank = rawLines.filter(l => l.trim().length > 0);
    const minIndent = nonBlank.length ? Math.min(...nonBlank.map(l => (l.match(/^[ \t]*/)[0] || '').length)) : 0;
    const dedented = rawLines.map(l => (l.length >= minIndent ? l.slice(minIndent) : l)).join('\n');

    // Si du code Python a été extrait, vérifier qu'il ne contient pas d'erreur de syntaxe flagrante
    let syntaxCheck = { syntaxValid: true, p53Status: 'PASSED' };
    if (dedented.trim() && (options.targetFile || '').endsWith('.py')) {
      syntaxCheck = this.verifyPythonSyntax(dedented, 'sandbox_candidate.py');
    }

    // 2. Calcul du signal d'erreur cérébelleux (Cerebellar Motor Error Signal)
    const cerebellarSignal = this.computeCerebellarMotorError(syntaxCheck, options);

    const isPromotable = syntaxCheck.syntaxValid && !cerebellarSignal.hasDivergence;

    return {
      success: isPromotable,
      p53Passed: isPromotable,
      verdict: isPromotable ? 'P53_CHECKPOINT_PASSED' : 'P53_CHECKPOINT_FAILED_APOPTOSIS',
      syntaxCheck,
      cerebellarSignal
    };
  }

  /**
   * Calcule la divergence motrice cérébelleuse (Cerebellar Error Signal) (max 3 params)
   */
  computeCerebellarMotorError(syntaxReport = {}, context = {}) {
    if (!syntaxReport.syntaxValid) {
      return {
        hasDivergence: true,
        errorType: 'SYNTAX_DIVERGENCE',
        motorAdjustmentPrompt: `Syntax error detected at line ${syntaxReport.faultLine || 'unknown'}: ${syntaxReport.error}. Adjust indentation and token syntax before re-submitting.`
      };
    }

    if (context.expectedPass && context.observedFail) {
      return {
        hasDivergence: true,
        errorType: 'FUNCTIONAL_REGRESSION',
        motorAdjustmentPrompt: 'Patch compiled cleanly but failed reproduction test assertion. Re-align variable references with surrounding scope.'
      };
    }

    return {
      hasDivergence: false,
      errorType: 'NONE',
      motorAdjustmentPrompt: 'Motor execution coherent. Ready for reality arbiter promotion.'
    };
  }

  /**
   * Boucle fermée de rétroaction cérébelleuse multi-tours (max 3 params)
   */
  async executeCerebellarLoop(patchFn, options = {}, maxAttempts = 3) {
    let currentSignal = null;
    let finalResult = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const candidatePatch = await patchFn(currentSignal, attempt);
      const evalResult = this.evaluatePatchExecution(candidatePatch, options);
      finalResult = evalResult;

      if (evalResult.p53Passed) {
        return {
          resolved: true,
          attempts: attempt,
          finalResult
        };
      }

      currentSignal = evalResult.cerebellarSignal;
    }

    return {
      resolved: false,
      attempts: maxAttempts,
      finalResult
    };
  }
}

const defaultSweSandboxVerification = new SweSandboxVerificationService();

module.exports = {
  SweSandboxVerificationService,
  defaultSweSandboxVerification
};
