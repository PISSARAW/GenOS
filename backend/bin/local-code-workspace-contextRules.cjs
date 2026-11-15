'use strict';

function collectWorkspaceContextPathsRule1(context) {
  return context.String(context.command).match(/(?:^|\s)([A-Za-z0-9_.\\/-]+\.(?:cjs|mjs|js|ts|py|rs))(?:\s|$)/i);
}

function collectWorkspaceContextPathsRule2(context) {
  return !context.normalized || context.normalized.startsWith('../') || context.path.isAbsolute(context.normalized)
      || context.normalized.split('/').some((part) => ['.git', '.genos', 'node_modules', 'target', 'dist', 'coverage'].includes(part.toLowerCase()));
}

function collectWorkspaceContextPathsRule3(context) {
  return !context.relative || context.relative.startsWith('..') || context.path.isAbsolute(context.relative);
}

module.exports = { collectWorkspaceContextPathsRule1, collectWorkspaceContextPathsRule2, collectWorkspaceContextPathsRule3 };
