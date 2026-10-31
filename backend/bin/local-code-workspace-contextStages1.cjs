'use strict';

function collectWorkspaceContextPathsStage1(__genosStageScope1) {
for (const entry of __genosStageScope1.entries) {
      if (__genosStageScope1.candidates.length >= __genosStageScope1.maxFiles) break;
      if (entry.name.startsWith('.') || ['node_modules', 'target', 'dist', 'coverage'].includes(entry.name.toLowerCase())) continue;
      const child = __genosStageScope1.relative ? __genosStageScope1.path.join(__genosStageScope1.relative, entry.name) : entry.name;
      const absolute = __genosStageScope1.path.join(__genosStageScope1.directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) (0, __genosStageScope1.walk)(absolute, child, __genosStageScope1.depth + 1);
      else if (entry.isFile()) (0, __genosStageScope1.add)(child);
    }
}

function collectWorkspaceContextPathsStage2(__genosStageScope2) {
for (const testPath of __genosStageScope2.tests) {
    const test = (0, __genosStageScope2.readExcerpt)(__genosStageScope2.root, testPath);
    if (!test.content) continue;
    const imports = /(?:\brequire\s*\(\s*|\bfrom\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
    let match;
    while ((match = imports.exec(test.content)) && __genosStageScope2.candidates.length < __genosStageScope2.maxFiles) {
      const base = __genosStageScope2.path.resolve(__genosStageScope2.root, __genosStageScope2.path.dirname(testPath), match[1]);
      const relative = __genosStageScope2.path.relative(__genosStageScope2.root, base);
      if ((0, __genosStageScope2.require)('./local-code-workspace-contextValues1.cjs').collectWorkspaceContextPathsValue3({ path: __genosStageScope2.path, relative })) continue;
      const possible = [relative, ...['.js', '.cjs', '.mjs', '.ts', '.json'].map((ext) => `${relative}${ext}`),
        ...['index.js', 'index.cjs'].map((file) => __genosStageScope2.path.join(relative, file))];
      possible.find((file) => __genosStageScope2.fs.existsSync(__genosStageScope2.path.resolve(__genosStageScope2.root, file)) && (0, __genosStageScope2.add)(file));
    }
  }
}

function collectWorkspaceContextPathsStage3(__genosStageScope3) {
for (const command of __genosStageScope3.allowedCommands) {
    const match = (0, __genosStageScope3.require)('./local-code-workspace-contextValues1.cjs').collectWorkspaceContextPathsValue1({ String: __genosStageScope3.String, command });
    if (match && (0, __genosStageScope3.add)(match[1])) __genosStageScope3.tests.push(match[1].replace(/\\/g, '/'));
  }
}

module.exports = { collectWorkspaceContextPathsStage1, collectWorkspaceContextPathsStage2, collectWorkspaceContextPathsStage3 };
