/**
 * SWE Fault Localizer Service — Proprioceptive Codebase Scanning & NER UvrA/MutS.
 *
 * Résout le problème d'agnosie proprioceptive de SWE-bench (où l'agent n'a que 23% de Loc).
 * Scanne les stacktraces, symboles, classes et exceptions pour localiser les fichiers cibles réels.
 * Intègre l'Atlas Topologique (SMC Loop Extrusion) multi-dépôts (12 dépôts officiels).
 */

const { defaultSweRepoAtlas } = require('./sweRepoAtlasService');

class SweFaultLocalizerService {
  constructor(options = {}) {
    this.repoAtlas = options.repoAtlas || defaultSweRepoAtlas;
  }

  /**
   * Extrait les symboles et mentions de fichiers d'un problème
   */
  extractProblemSignatures(problemStatement = '') {
    const text = String(problemStatement || '');
    const fileMatches = [];
    const traceRegex = /(?:File\s+["']([^"']+\.py)["']|(?:[a-zA-Z0-9_]+\/)+[a-zA-Z0-9_]+\.py)/g;
    let m;
    while ((m = traceRegex.exec(text)) !== null) {
      const matchPath = m[1] || m[0];
      if (!fileMatches.includes(matchPath)) fileMatches.push(matchPath);
    }

    const classMatches = [];
    const classRegex = /\b([A-Z][a-zA-Z0-9_]+(?:Error|Exception|Field|QuerySet|Model|View|Manager|Form|Resolver)?)\b/g;
    while ((m = classRegex.exec(text)) !== null) {
      if (m[1].length > 3 && !classMatches.includes(m[1])) classMatches.push(m[1]);
    }

    const funcMatches = [];
    const funcRegex = /\bdef\s+([a-z_][a-z0-9_]+)\b|\b([a-z_][a-z0-9_]+)\(/g;
    while ((m = funcRegex.exec(text)) !== null) {
      const fn = m[1] || m[2];
      if (fn && fn.length > 2 && !funcMatches.includes(fn)) funcMatches.push(fn);
    }

    return {
      explicitFilePaths: fileMatches,
      candidateClasses: classMatches.slice(0, 10),
      candidateFunctions: funcMatches.slice(0, 10)
    };
  }

  /**
   * Localise les Top-K fichiers suspects dans le dépôt via SMC Loop Extrusion
   */
  localizeFault(problemStatement, repoName = 'django', topK = 3) {
    const signatures = this.extractProblemSignatures(problemStatement);
    const loopResult = this.repoAtlas.extrudeTopologicalLoop(repoName, signatures, topK);

    return {
      success: true,
      repoName: loopResult.repo,
      extractedSignatures: signatures,
      topCandidates: loopResult.candidates,
      primarySuspect: loopResult.primarySuspect,
      confidence: loopResult.confidence
    };
  }
}

const defaultSweFaultLocalizer = new SweFaultLocalizerService();

module.exports = {
  SweFaultLocalizerService,
  defaultSweFaultLocalizer
};
