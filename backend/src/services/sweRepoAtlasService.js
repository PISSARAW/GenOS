/**
 * SWE Repo Atlas Service — Biomimetic Topological Codebase Mapping & SMC Loop Extrusion.
 *
 * Applique le biomimétisme de la conformation chromatinienne et de l'extrusion de boucles SMC :
 * - Structure le dépôt en domaines d'association topologique (TADs / répertoires)
 * - Projette les symboles NER sur le graphe de dépendances pour identifier les fichiers cibles
 * - Couvre l'intégralité des 12 dépôts officiels de SWE-bench Lite
 */

const fs = require('fs');
const path = require('path');

class SweRepoAtlasService {
  constructor(options = {}) {
    this.atlasData = this._loadAtlasData(options.atlasPath);
  }

  _loadAtlasData(customPath) {
    const dataFile = customPath || path.join(__dirname, 'sweRepoAtlasData.json');
    try {
      if (fs.existsSync(dataFile)) {
        return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      }
    } catch (_) {}
    return {};
  }

  normalizeRepoName(rawName = '') {
    const clean = String(rawName || '').trim().toLowerCase().split('/').pop();
    if (clean === 'scikit-learn') return 'sklearn';
    return clean;
  }

  getRepoFiles(repoName = 'django') {
    const key = this.normalizeRepoName(repoName);
    return this.atlasData[key] || [];
  }

  calculateLoopAnchorScore(filePath, signatures = {}) {
    let score = 0;
    const lowerPath = filePath.toLowerCase();
    const parts = lowerPath.split('/');

    // 1. Détection dans la trace de pile explicite
    for (const ef of signatures.explicitFilePaths || []) {
      const lowerEf = ef.toLowerCase();
      if (lowerPath.endsWith(lowerEf) || lowerEf.endsWith(lowerPath)) score += 10.0;
      else if (parts.some(p => p.length > 3 && lowerEf.includes(p))) score += 2.0;
    }

    // 2. Score de classe et symboles (CamelCase)
    for (const cls of signatures.candidateClasses || []) {
      const stem = cls.toLowerCase().replace(/(error|exception|base|mixin)$/, '');
      if (stem.length > 2 && lowerPath.includes(stem)) score += 3.5;
    }

    // 3. Score de fonctions et méthodes (snake_case)
    for (const fn of signatures.candidateFunctions || []) {
      if (fn.length > 2 && lowerPath.includes(fn.toLowerCase())) score += 2.0;
    }

    return score;
  }

  extrudeTopologicalLoop(repoName, signatures = {}, topK = 3) {
    const files = this.getRepoFiles(repoName);
    const scored = [];

    for (const f of files) {
      const sc = this.calculateLoopAnchorScore(f, signatures);
      scored.push({ path: f, score: Number(sc.toFixed(2)) });
    }

    // Intégrer les fichiers explicites identifiés
    for (const explicit of signatures.explicitFilePaths || []) {
      if (!scored.some(item => item.path === explicit)) {
        scored.push({ path: explicit, score: 9.0 });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, topK));

    return {
      repo: this.normalizeRepoName(repoName),
      candidates: top,
      primarySuspect: top[0] ? top[0].path : null,
      confidence: top[0] && top[0].score >= 2.0 ? 'HIGH' : 'MEDIUM'
    };
  }
}

const defaultSweRepoAtlas = new SweRepoAtlasService();

module.exports = {
  SweRepoAtlasService,
  defaultSweRepoAtlas
};
