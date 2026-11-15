'use strict';

function collectWorkspaceContextPathsStep1(context) {
for (const entry of context.entries) {
      if (context.candidates.length >= context.maxFiles) break;
      if (entry.name.startsWith('.') || ['node_modules', 'target', 'dist', 'coverage'].includes(entry.name.toLowerCase())) continue;
      const child = context.relative ? context.path.join(context.relative, entry.name) : entry.name;
      const absolute = context.path.join(context.directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) context.walk(absolute, child, context.depth + 1);
      else if (entry.isFile()) context.add(child);
    }
}

function collectWorkspaceContextPathsStep2(context) {
for (const testPath of context.tests) {
    const test = context.readExcerpt(context.root, testPath);
    if (!test.content) continue;
    const imports = /(?:\brequire\s*\(\s*|\bfrom\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
    let match;
    while ((match = imports.exec(test.content)) && context.candidates.length < context.maxFiles) {
      const base = context.path.resolve(context.root, context.path.dirname(testPath), match[1]);
      const relative = context.path.relative(context.root, base);
      if (context.require('./local-code-workspace-contextRules.cjs').collectWorkspaceContextPathsRule3({ path: context.path, relative })) continue;
      const possible = [relative, ...['.js', '.cjs', '.mjs', '.ts', '.json'].map((ext) => `${relative}${ext}`),
        ...['index.js', 'index.cjs'].map((file) => context.path.join(relative, file))];
      possible.find((file) => context.fs.existsSync(context.path.resolve(context.root, file)) && context.add(file));
    }
  }
}

function collectWorkspaceContextPathsStep3(context) {
for (const command of context.allowedCommands) {
    const match = context.require('./local-code-workspace-contextRules.cjs').collectWorkspaceContextPathsRule1({ String: context.String, command });
    if (match && context.add(match[1])) context.tests.push(match[1].replace(/\\/g, '/'));
  }
}

module.exports = { collectWorkspaceContextPathsStep1, collectWorkspaceContextPathsStep2, collectWorkspaceContextPathsStep3 };
