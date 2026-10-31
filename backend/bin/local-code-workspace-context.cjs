'use strict';

const path = require('path');

function collectWorkspaceContextPaths({ root, allowedCommands, readExcerpt, maxFiles, fs = require('fs') } = {}) {
  const candidates = [];
  const seen = new Set();
  const add = (relative) => {
    const resolved = path.resolve(root, relative);
    const normalized = path.relative(root, resolved).split(path.sep).join('/');
    if (require('./local-code-workspace-contextValues1.cjs').collectWorkspaceContextPathsValue2({ normalized, path })) return false;
    const excerpt = readExcerpt(root, normalized);
    if (excerpt.refused && excerpt.refused !== 'too_large') return false;
    if (!seen.has(normalized)) { seen.add(normalized); candidates.push(normalized); }
    return true;
  };
  const tests = [];
  require('./local-code-workspace-contextStages1.cjs').collectWorkspaceContextPathsStage3({ String, add, allowedCommands, require, tests });
  require('./local-code-workspace-contextStages1.cjs').collectWorkspaceContextPathsStage2({ add, candidates, fs, maxFiles, path, readExcerpt, require, root, tests });
  function walk(directory, relative, depth = 0) {
    if (candidates.length >= maxFiles || depth > 10) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
    catch (_) { return; }
    require('./local-code-workspace-contextStages1.cjs').collectWorkspaceContextPathsStage1({ add, candidates, depth, directory, get entries() { return entries; }, set entries(__genosNextStageValue) { entries = __genosNextStageValue; }, maxFiles, path, relative, walk });
  }
  walk(root, '');
  return candidates.slice(0, maxFiles);
}

module.exports = { collectWorkspaceContextPaths };
