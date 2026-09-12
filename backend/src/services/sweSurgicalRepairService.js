/**
 * SWE Surgical Repair Service — Biomimetic DNA Excision Repair (NER UvrBC).
 *
 * Applique le biomimétisme de la double incision enzymatique UvrC :
 * - Découpe chirurgicale minimale autour de la lésion
 * - Contrôle formel du Blast Radius (RiskScore <= 45)
 * - Assainissement déterministe du patch via SweDiffSanitizerService
 * - Génération de patch git unidiff standard sans réécriture globale destructrice.
 */

const { defaultSweDiffSanitizer } = require('./sweDiffSanitizerService');

class SweSurgicalRepairService {
  constructor(options = {}) {
    this.maxSurgicalRisk = options.maxSurgicalRisk || 45;
    this.diffSanitizer = options.diffSanitizer || defaultSweDiffSanitizer;
  }

  /**
   * Calcule le score de Blast Radius et vérifie le caractère chirurgical
   */
  calculateBlastRadius(filesCount = 1, addedLines = 0, removedLines = 0) {
    const totalLines = addedLines + removedLines;
    const riskScore = Math.min(100, (filesCount * 15) + Math.floor(totalLines / 4));
    const isSurgical = riskScore <= this.maxSurgicalRisk;

    return {
      filesCount,
      addedLines,
      removedLines,
      totalLines,
      riskScore,
      isSurgical,
      verdict: isSurgical ? 'SURGICAL_CONFINED' : 'EXCESSIVE_BLAST_RADIUS'
    };
  }

  /**
   * Génère un diff unifié minimal pour un remplacement localisé (max 3 params)
   */
  synthesizeSurgicalDiff(filePath, originalChunk, editConfig = {}) {
    const origLines = String(originalChunk || '').split('\n');
    const replLines = String(editConfig.replacementChunk || editConfig.replacement || '').split('\n');
    const startLine = Number(editConfig.startLine || 1);

    const origCount = origLines.length;
    const replCount = replLines.length;

    const diffHeader = [
      `diff --git a/${filePath} b/${filePath}`,
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      `@@ -${startLine},${origCount} +${startLine},${replCount} @@`
    ];

    const diffBody = [];
    for (const line of origLines) diffBody.push(`-${line}`);
    for (const line of replLines) diffBody.push(`+${line}`);

    const fullPatch = [...diffHeader, ...diffBody].join('\n') + '\n';
    const metrics = this.calculateBlastRadius(1, replCount, origCount);

    return {
      success: true,
      filePath,
      startLine,
      patch: fullPatch,
      metrics,
      isSurgical: metrics.isSurgical
    };
  }

  /**
   * Applique le principe NER : valide que le patch ne touche que les nucléotides cibles
   */
  validateExcisionBoundary(patchStr = '', fallbackPath = 'target.py') {
    let sanitized = patchStr;
    const hasGitHeader = patchStr.includes('diff --git');

    if (!hasGitHeader) {
      const res = this.diffSanitizer.sanitizePatch(patchStr, fallbackPath);
      if (res.valid) sanitized = res.patch;
    }

    const lines = sanitized.split('\n');
    let added = 0;
    let removed = 0;
    let files = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git')) files++;
      else if (line.startsWith('+') && !line.startsWith('+++')) added++;
      else if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }

    const metrics = this.calculateBlastRadius(Math.max(1, files), added, removed);
    const validHeaders = sanitized.includes('diff --git') && sanitized.includes('--- ') && sanitized.includes('+++ ');

    return {
      validHeaders,
      metrics,
      sanitizedPatch: sanitized,
      acceptableForPromotion: validHeaders && metrics.isSurgical
    };
  }
}

const defaultSweSurgicalRepair = new SweSurgicalRepairService();

module.exports = {
  SweSurgicalRepairService,
  defaultSweSurgicalRepair
};
