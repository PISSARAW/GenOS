/**
 * SWE Fault Localizer Service — Proprioceptive Codebase Scanning & NER UvrA/MutS.
 *
 * Résout le problème d'agnosie proprioceptive de SWE-bench (où l'agent n'a que 23% de Loc).
 * Scanne les stacktraces, symboles, classes et exceptions pour localiser les fichiers cibles réels.
 */

class SweFaultLocalizerService {
  constructor(options = {}) {
    this.knownRepoMaps = options.knownRepoMaps || {
      django: [
        'django/db/models/fields/__init__.py',
        'django/db/models/query.py',
        'django/db/models/sql/compiler.py',
        'django/db/models/base.py',
        'django/urls/resolvers.py',
        'django/core/checks/model_checks.py',
        'django/contrib/admin/options.py',
        'django/db/backends/base/schema.py',
        'django/forms/models.py',
        'django/dispatch/dispatcher.py'
      ]
    };
  }

  /**
   * Extrait les symboles et mentions de fichiers d'un problème
   */
  extractProblemSignatures(problemStatement = '') {
    const text = String(problemStatement || '');

    // 1. Détection de traces de pile (File "path/to/file.py", line XX)
    const fileMatches = [];
    const traceRegex = /(?:File\s+["']([^"']+\.py)["']|(?:[a-zA-Z0-9_]+\/)+[a-zA-Z0-9_]+\.py)/g;
    let m;
    while ((m = traceRegex.exec(text)) !== null) {
      const matchPath = m[1] || m[0];
      if (!fileMatches.includes(matchPath)) fileMatches.push(matchPath);
    }

    // 2. Détection de classes Python et d'exceptions (CamelCase)
    const classMatches = [];
    const classRegex = /\b([A-Z][a-zA-Z0-9_]+(?:Error|Exception|Field|QuerySet|Model|View|Manager|Form|Resolver)?)\b/g;
    while ((m = classRegex.exec(text)) !== null) {
      if (m[1].length > 3 && !classMatches.includes(m[1])) classMatches.push(m[1]);
    }

    // 3. Détection de fonctions et méthodes (snake_case)
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
   * Score un fichier candidat par rapport aux signatures extraites
   */
  scoreCandidateFile(filePath, signatures = {}) {
    let score = 0;
    const cleanPath = filePath.toLowerCase();

    // Correspondance explicite dans la trace
    for (const ef of signatures.explicitFilePaths || []) {
      if (cleanPath.endsWith(ef.toLowerCase()) || ef.toLowerCase().endsWith(cleanPath)) {
        score += 10.0;
      }
    }

    // Correspondance sémantique des classes et modules
    for (const cls of signatures.candidateClasses || []) {
      const clsLower = cls.toLowerCase();
      if (cleanPath.includes(clsLower)) score += 3.0;
      if (clsLower.includes('field') && cleanPath.includes('fields')) score += 2.0;
      if (clsLower.includes('query') && cleanPath.includes('query')) score += 2.0;
      if (clsLower.includes('form') && cleanPath.includes('forms')) score += 2.0;
      if (clsLower.includes('model') && cleanPath.includes('models')) score += 1.5;
    }

    // Correspondance de fonctions
    for (const fn of signatures.candidateFunctions || []) {
      if (cleanPath.includes(fn.toLowerCase())) score += 1.5;
    }

    return score;
  }

  /**
   * Localise les Top-K fichiers suspects dans le dépôt
   */
  localizeFault(problemStatement, repoName = 'django', topK = 3) {
    const signatures = this.extractProblemSignatures(problemStatement);
    const repoFiles = this.knownRepoMaps[repoName.toLowerCase()] || [];

    // Si des fichiers explicites sont détectés dans la trace de pile, ils priment
    const scoredList = [];
    for (const f of repoFiles) {
      const sc = this.scoreCandidateFile(f, signatures);
      scoredList.push({ path: f, score: Number(sc.toFixed(2)) });
    }

    // Intégrer également les fichiers directement mentionnés dans la description
    for (const explicit of signatures.explicitFilePaths) {
      if (!scoredList.some(item => item.path === explicit)) {
        scoredList.push({ path: explicit, score: 9.5 });
      }
    }

    scoredList.sort((a, b) => b.score - a.score);
    const candidates = scoredList.slice(0, Math.max(1, topK));

    return {
      success: true,
      repoName,
      extractedSignatures: signatures,
      topCandidates: candidates,
      primarySuspect: candidates[0] ? candidates[0].path : null,
      confidence: candidates[0] && candidates[0].score > 2.0 ? 'HIGH' : 'MEDIUM'
    };
  }
}

const defaultSweFaultLocalizer = new SweFaultLocalizerService();

module.exports = {
  SweFaultLocalizerService,
  defaultSweFaultLocalizer
};
