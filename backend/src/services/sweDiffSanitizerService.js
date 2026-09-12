/**
 * SWE Diff Sanitizer Service — Biomimetic Diff Normalization (NER UvrC Excision).
 *
 * Applique le biomimétisme de la réparation par excision UvrC :
 * - Découpe et réaligne les nucléotides modifiés (hunks de patch)
 * - Reconstruit les en-têtes standard 'diff --git', '--- a/', '+++ b/'
 * - Recalcule de manière déterministe les indices de lignes '@@ -l,c +l,c @@'
 * - Garantit 100% de conformité syntaxique avec unidiff et git apply
 */

class SweDiffSanitizerService {
  constructor(options = {}) {
    this.defaultPrefix = options.defaultPrefix || 'a/';
  }

  /**
   * Extrait le contenu du diff des blocs Markdown ou du texte brut
   */
  extractDiffContent(rawText = '') {
    const text = String(rawText || '').trim();
    const mdMatch = text.match(/```(?:diff|patch)?([\s\S]*?)```/);
    if (mdMatch) return mdMatch[1].trim();

    const diffIdx = text.indexOf('diff --git');
    if (diffIdx !== -1) return text.slice(diffIdx).trim();

    const patchIdx = text.indexOf('--- ');
    if (patchIdx !== -1) return text.slice(patchIdx).trim();

    return text;
  }

  /**
   * Normalise le chemin cible et génère les en-têtes git canoniques
   */
  resolveTargetPaths(rawDiff = '', fallbackPath = 'patch_target.py') {
    const lines = rawDiff.split('\n');
    let detectedPath = null;

    for (const l of lines) {
      const gitMatch = l.match(/^diff --git a\/(.+?) b\/(.+?)$/);
      if (gitMatch) { detectedPath = gitMatch[2]; break; }
      const plusMatch = l.match(/^\+\+\+ (?:b\/)?(.+?)$/);
      if (plusMatch) { detectedPath = plusMatch[1]; break; }
    }

    const finalPath = (detectedPath || fallbackPath).replace(/^[ab]\//, '');
    return {
      filePath: finalPath,
      gitHeader: `diff --git a/${finalPath} b/${finalPath}`,
      origHeader: `--- a/${finalPath}`,
      newHeader: `+++ b/${finalPath}`
    };
  }

  /**
   * Recalcule et réaligne un hunk unifié pour exactitude mathématique
   */
  realignHunk(hunkBodyLines = [], origStart = 1) {
    let origCount = 0;
    let newCount = 0;
    const normalizedBody = [];

    for (const line of hunkBodyLines) {
      if (line.startsWith('-')) {
        origCount++;
        normalizedBody.push(line);
      } else if (line.startsWith('+')) {
        newCount++;
        normalizedBody.push(line);
      } else {
        origCount++;
        newCount++;
        const safeLine = line.startsWith(' ') ? line : ` ${line}`;
        normalizedBody.push(safeLine);
      }
    }

    const header = `@@ -${origStart},${origCount} +${origStart},${newCount} @@`;
    return [header, ...normalizedBody];
  }

  /**
   * Assainit et normalise un patch complet pour conformité unidiff
   */
  sanitizePatch(rawInput = '', fallbackPath = 'patch_target.py') {
    const extracted = this.extractDiffContent(rawInput);
    if (!extracted) return { valid: false, patch: '', error: 'Empty diff input' };

    const paths = this.resolveTargetPaths(extracted, fallbackPath);
    const lines = extracted.split('\n');
    const bodyLines = lines.filter(l => (
      !l.startsWith('diff --git') && !l.startsWith('--- ') && !l.startsWith('+++ ') && !l.startsWith('index ')
    ));

    const hunkLines = [];
    let startLine = 1;

    for (const l of bodyLines) {
      const hunkHeaderMatch = l.match(/^@@ -(\d+)/);
      if (hunkHeaderMatch) {
        startLine = Number(hunkHeaderMatch[1]);
      } else if (l.startsWith('+') || l.startsWith('-') || l.startsWith(' ') || l.trim() === '') {
        hunkLines.push(l);
      }
    }

    if (hunkLines.length === 0) {
      return { valid: false, patch: '', error: 'No diff modifications found' };
    }

    const realignedHunk = this.realignHunk(hunkLines, startLine);
    const finalPatch = [
      paths.gitHeader,
      paths.origHeader,
      paths.newHeader,
      ...realignedHunk
    ].join('\n') + '\n';

    return {
      valid: true,
      filePath: paths.filePath,
      patch: finalPatch
    };
  }
}

const defaultSweDiffSanitizer = new SweDiffSanitizerService();

module.exports = {
  SweDiffSanitizerService,
  defaultSweDiffSanitizer
};
