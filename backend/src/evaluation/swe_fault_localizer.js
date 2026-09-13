/**
 * GenOS Proprioceptive Fault Localization for SWE-bench
 * Identifies suspect candidate files and pinpoints suspect code excerpts.
 */

const fs = require('fs');
const path = require('path');

function getAllPyFiles(dir, repoDir) {
  const files = [];
  function walk(currentDir) {
    for (const item of fs.readdirSync(currentDir)) {
      if (item.startsWith('.') || item === '__pycache__' || item === 'tests' || item === 'testing' || item.endsWith('.egg-info')) continue;
      const fullPath = path.join(currentDir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (item.endsWith('.py')) {
          files.push(path.relative(repoDir, fullPath).replace(/\\/g, '/'));
        }
      } catch (e) {}
    }
  }
  walk(dir);
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
      score += 25;
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

  for (const kw of sampleKeywords) {
    score += scoreKeywordMatch(stem, content, kw);
  }
  return score;
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

function extractProblemKeywords(problemStatement) {
  const codeIdentifiers = problemStatement.match(/\b(?:def|class)?\s*([a-zA-Z_][a-zA-Z0-9_]{3,})\b/g) || [];
  const stopwords = new Set(['self', 'true', 'false', 'none', 'import', 'return', 'raise', 'from', 'with', 'that', 'this', 'have', 'when', 'what']);
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

function locateCandidateFiles(repoDir, problemStatement, testHints = []) {
  const allPyFiles = getAllPyFiles(repoDir, repoDir);
  const scoredFiles = new Map(allPyFiles.map(f => [f, 0]));

  scoreFromTestHints(allPyFiles, testHints, scoredFiles);
  scoreExplicitMentions(allPyFiles, problemStatement, scoredFiles);
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

function extractRelevantExcerpt(fileContent, problemStatement, targetRelFile = '') {
  const lines = fileContent.split('\n');
  if (lines.length <= 120) {
    return { excerpt: lines.join('\n'), startLine: 1, endLine: lines.length };
  }

  const fileBasename = path.basename(targetRelFile);
  const kws = extractProblemKeywords(problemStatement);
  const targetCenter = findTracebackLine(lines, problemStatement, fileBasename) ||
    findMatchingProblemLine(lines, problemStatement) ||
    findMatchingFunctionDef(lines, problemStatement) ||
    findFunctionByKeywords(lines, kws) ||
    Math.min(50, Math.floor(lines.length / 2));

  const startLine = Math.max(0, targetCenter - 25);
  const endLine = Math.min(lines.length - 1, targetCenter + 65);
  const excerptLines = lines.slice(startLine, endLine + 1);

  return {
    excerpt: excerptLines.join('\n'),
    startLine: startLine + 1,
    endLine: endLine + 1
  };
}

module.exports = {
  getAllPyFiles,
  locateCandidateFiles,
  extractRelevantExcerpt
};
