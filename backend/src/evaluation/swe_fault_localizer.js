/**
 * GenOS Proprioceptive Fault Localization for SWE-bench
 * Identifies suspect candidate files and pinpoints suspect code excerpts.
 */

const fs = require('fs');
const path = require('path');
const EXCLUDED_ITEMS = new Set(['__pycache__', 'tests', 'testing', 'doc', 'docs']);

function isExcludedItem(item) {
  return item.startsWith('.') || EXCLUDED_ITEMS.has(item) || item.endsWith('.egg-info')
    || /^(?:test_.*|.*_test)\.py$/i.test(item);
}

function walkPythonFiles(params) {
  const { currentDir, repoDir, files } = params;
  for (const item of fs.readdirSync(currentDir)) {
    if (isExcludedItem(item)) continue;
    const fullPath = path.join(currentDir, item);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) walkPythonFiles({ currentDir: fullPath, repoDir, files });
      else if (item.endsWith('.py')) files.push(path.relative(repoDir, fullPath).replace(/\\/g, '/'));
    } catch (error) { continue; }
  }
}

function getAllPyFiles(dir, repoDir) {
  const files = [];
  walkPythonFiles({ currentDir: dir, repoDir, files });
  return files;
}

function scoreKeywordMatch(stem, content, kw) {
  let score = 0;
  const cleanKw = kw.toLowerCase().replace(/s$/, '');
  if (stem.length > 3 && (stem === cleanKw || cleanKw.includes(stem))) {
    score += 80;
  }
  if (content.includes(kw)) {
    score += 5;
    if (content.includes(`def ${kw}`) || content.includes(`class ${kw}`)) {
      score += 160;
    }
  }
  return score;
}

function scoreFileByKeywords(content, filename, sampleKeywords) {
  let score = filename.includes('test') ? 0 : 10;
  if (filename.includes('/packages/') || filename.includes('/vendor/')) {
    score -= 200;
  }
  const stem = path.basename(filename, '.py').toLowerCase().replace(/s$/, '');
  return score + sampleKeywords.reduce((total, keyword) => total + scoreKeywordMatch(stem, content, keyword), 0);
}

function scoreExplicitMentions(allPyFiles, problemStatement, scoredFiles) {
  const mentionedPaths = problemStatement.match(/[a-zA-Z0-9_\/\\.-]+\.py/g) || [];
  for (const mp of mentionedPaths) {
    const cleanMp = mp.replace(/\\/g, '/').replace(/^\/+/, '');
    for (const f of allPyFiles) {
      if (f === cleanMp || f.endsWith('/' + cleanMp) || cleanMp.endsWith('/' + f)) {
        scoredFiles.set(f, (scoredFiles.get(f) || 0) + 800);
      }
    }
  }
}

function scoreExplicitOptions(params) {
  const { allPyFiles, problemStatement, scoredFiles, repoDir } = params;
  const options = problemStatement.match(/--[a-z0-9]+(?:-[a-z0-9]+)+/gi) || [];
  for (const file of allPyFiles) {
    const content = fs.readFileSync(path.join(repoDir, file), 'utf8');
    if (options.some(option => content.includes(option))) {
      scoredFiles.set(file, (scoredFiles.get(file) || 0) + 3000);
    }
  }
}

function scoreQualifiedSymbols(params) {
  const { allPyFiles, problemStatement, scoredFiles, repoDir } = params;
  const symbols = [...problemStatement.matchAll(/\b[A-Za-z_]\w*\.([A-Za-z_]\w*)\b/g)].map(match => match[1]);
  for (const file of allPyFiles) {
    const content = fs.readFileSync(path.join(repoDir, file), 'utf8');
    if (symbols.some(symbol => content.includes(`def ${symbol}(`) || content.includes(`def ${symbol} (`))) {
      scoredFiles.set(file, (scoredFiles.get(file) || 0) + 3000);
    }
  }
}

function extractProblemKeywords(problemStatement) {
  const codeIdentifiers = problemStatement.match(/\b(?:def|class)?\s*([a-zA-Z_][a-zA-Z0-9_]{3,})\b/g) || [];
  const stopwords = new Set(['self', 'true', 'false', 'none', 'import', 'return', 'raise', 'from', 'with', 'that', 'this', 'have', 'when', 'what',
    'error', 'name', 'names', 'contains', 'required', 'since', 'every', 'significant', 'nested', 'already', 'added', 'should', 'been', 'well']);
  return Array.from(new Set(codeIdentifiers.map(w => w.replace(/^(def|class)\s+/, '').trim())))
    .filter(w => !stopwords.has(w.toLowerCase()))
    .slice(0, 15);
}

function scoreFromTestHints(allPyFiles, testHints, scoredFiles) {
  for (const hint of testHints || []) {
    const cleanHint = String(hint).split('::')[0];
    const rawStem = path.basename(cleanHint, '.py').replace(/^test_/, '').toLowerCase();
    for (const f of allPyFiles) {
      const targetStem = path.basename(f, '.py').toLowerCase();
      if (targetStem === rawStem) {
        scoredFiles.set(f, (scoredFiles.get(f) || 0) + 500);
      } else if (targetStem.length > 3 && rawStem.includes(targetStem)) {
        scoredFiles.set(f, (scoredFiles.get(f) || 0) + 150);
      }
    }
  }
}

function scoreFromTraceback(allPyFiles, traceback, scoredFiles) {
  if (!traceback) return;
  for (const f of allPyFiles) {
    const base = path.basename(f);
    if (traceback.includes(f) || (base.length > 5 && traceback.includes(base))) {
      scoredFiles.set(f, (scoredFiles.get(f) || 0) + 100);
    }
  }
}

function locateCandidateFiles(repoDir, problemStatement, options = {}) {
  const allPyFiles = getAllPyFiles(repoDir, repoDir);
  const scoredFiles = new Map(allPyFiles.map(f => [f, 0]));
  const testHints = Array.isArray(options) ? options : (options.testHints || []);
  const traceback = Array.isArray(options) ? '' : (options.traceback || '');

  scoreFromTraceback(allPyFiles, traceback, scoredFiles);
  scoreFromTestHints(allPyFiles, testHints, scoredFiles);
  scoreExplicitMentions(allPyFiles, problemStatement, scoredFiles);
  scoreExplicitOptions({ allPyFiles, problemStatement, scoredFiles, repoDir });
  scoreQualifiedSymbols({ allPyFiles, problemStatement, scoredFiles, repoDir });
  const sampleKeywords = extractProblemKeywords(problemStatement);

  for (const f of allPyFiles) {
    try {
      const content = fs.readFileSync(path.join(repoDir, f), 'utf8');
      const kwScore = scoreFileByKeywords(content, f, sampleKeywords);
      scoredFiles.set(f, (scoredFiles.get(f) || 0) + kwScore);
    } catch (e) {}
  }

  const sorted = Array.from(scoredFiles.entries())
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([file]) => file);

  return sorted.length > 0 ? sorted.slice(0, 5) : allPyFiles.slice(0, 3);
}

function findTracebackLine(lines, problemStatement, fileBasename) {
  if (!fileBasename) return null;
  const escaped = fileBasename.replace('.', '\\.');
  const tbRegex = new RegExp(escaped + '(?::|["\']?,\\s*line\\s*)(\\d+)', 'gi');
  const matchedLines = [];
  let match;
  while ((match = tbRegex.exec(problemStatement)) !== null) {
    matchedLines.push(parseInt(match[1], 10));
  }
  if (matchedLines.length === 0) return null;
  const targetLine = matchedLines[matchedLines.length - 1];
  return targetLine > 0 && targetLine <= lines.length ? targetLine : null;
}

function findMatchingProblemLine(lines, problemStatement) {
  const problemLines = problemStatement.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 8 && !l.startsWith('http') && !l.startsWith('Traceback') && !l.startsWith('File '));
  for (const pl of problemLines) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pl)) return i + 1;
    }
  }
  return null;
}

function findMatchingFunctionDef(lines, problemStatement) {
  const funcMatches = problemStatement.match(/\b([a-zA-Z_][a-zA-Z0-9_]+)\s*\(/g) || [];
  const candidateFuncs = funcMatches.map(m => m.replace(/\s*\(/, '')).filter(f => f.length > 3);
  for (const fn of candidateFuncs) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`def ${fn}(`) || lines[i].includes(`def ${fn} (`)) return i + 1;
    }
  }
  return null;
}

function findNameAssignment(lines, problemStatement) {
  if (!/\bname\b/i.test(problemStatement)) return null;
  const index = lines.findIndex(line => /\bself\._?name\s*=\s*name\b/.test(line));
  return index < 0 ? null : index + 1;
}

function findExplicitOptionLine(lines, problemStatement) {
  const options = problemStatement.match(/--[a-z0-9]+(?:-[a-z0-9]+)+/gi) || [];
  for (const option of options) {
    const index = lines.findIndex(line => line.includes(option));
    if (index >= 0) return index + 1;
  }
  return null;
}

function countLineKeywords(line, keywords) {
  let count = 0;
  for (const kw of keywords) {
    if (kw.length > 3 && line.toLowerCase().includes(kw.toLowerCase())) {
      count++;
    }
  }
  return count;
}

function findFunctionByKeywords(lines, problemKeywords) {
  let bestLine = null;
  let maxMatches = 0;
  let currentFuncLine = null;
  let currentMatches = 0;
  const defPattern = new RegExp('^(?:\\s{4})?(?:def|class)\\s+');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (defPattern.test(line)) {
      if (currentMatches > maxMatches && currentFuncLine !== null) {
        maxMatches = currentMatches;
        bestLine = currentFuncLine;
      }
      currentFuncLine = i + 1;
      currentMatches = 0;
    }
    currentMatches += countLineKeywords(line, problemKeywords);
  }
  return currentMatches > maxMatches && currentFuncLine !== null ? currentFuncLine : bestLine;
}

function selectExcerptCenter(params) {
  const { lines, problemStatement, targetRelFile, traceback, keywords } = params;
  const fileBasename = path.basename(targetRelFile);
  const candidates = [
    findMatchingProblemLine(lines, problemStatement),
    findMatchingFunctionDef(lines, problemStatement),
    findExplicitOptionLine(lines, problemStatement),
    findNameAssignment(lines, problemStatement),
    findTracebackLine(lines, traceback, fileBasename),
    findFunctionByKeywords(lines, keywords)
  ];
  return candidates.find(Boolean) || Math.min(50, Math.floor(lines.length / 2));
}

function extractRelevantExcerpt(fileContent, problemStatement, location = '') {
  const lines = fileContent.split('\n');
  if (lines.length <= 250) {
    return { excerpt: lines.join('\n'), startLine: 1, endLine: lines.length };
  }

  const options = typeof location === 'string' ? { targetRelFile: location } : location;
  const kws = extractProblemKeywords(problemStatement);
  const targetCenter = selectExcerptCenter({ lines, problemStatement,
    targetRelFile: options.targetRelFile || '', traceback: options.traceback || '', keywords: kws });
  const startLine = Math.max(0, targetCenter - 20);
  const endLine = Math.min(lines.length - 1, targetCenter + 35);
  const excerptLines = lines.slice(startLine, endLine + 1);

  return {
    excerpt: excerptLines.join('\n'),
    startLine: startLine + 1,
    endLine: endLine + 1
  };
}

function extractRelatedTestContext(params) {
  const { source, testTargets, excludeRange } = params;
  const terms = [...new Set((testTargets || []).join('_').toLowerCase()
    .split(/[^a-z0-9]+/).filter(term => term.length > 4 && term !== 'tests'))];
  if (!terms.length) return '';

  const lines = source.split('\n');
  const functions = [];
  let current = null;
  for (let index = 0; index < lines.length; index++) {
    if (/^\s{4}def\s+/.test(lines[index]) || /^\s{4}async\s+def\s+/.test(lines[index])) {
      if (current) current.end = index - 1;
      current = { start: index, end: lines.length - 1 };
      functions.push(current);
    }
  }

  const ranked = functions.map(block => {
    const text = lines.slice(block.start, block.end + 1).join('\n').toLowerCase();
    const score = terms.reduce((total, term) => total
      + Math.min(3, text.split(term).length - 1), 0);
    return { ...block, score };
  }).filter(block => block.score > 0
    && (block.end + 1 < excludeRange.startLine || block.start + 1 > excludeRange.endLine))
    .sort((left, right) => right.score - left.score);

  return ranked.slice(0, 5).map(block => lines
    .slice(block.start, Math.min(block.end + 1, block.start + 30))
    .map((line, offset) => `${String(block.start + offset + 1).padStart(4)} | ${line}`)
    .join('\n')).join('\n\n');
}

module.exports = {
  getAllPyFiles,
  locateCandidateFiles,
  extractRelevantExcerpt,
  extractRelatedTestContext
};
