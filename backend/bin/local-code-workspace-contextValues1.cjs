'use strict';

function collectWorkspaceContextPathsValue1(__genosValueScope1) {
  return (0, __genosValueScope1.String)(__genosValueScope1.command).match(/(?:^|\s)([A-Za-z0-9_.\\/-]+\.(?:cjs|mjs|js|ts|py|rs))(?:\s|$)/i);
}

function collectWorkspaceContextPathsValue2(__genosValueScope2) {
  return !__genosValueScope2.normalized || __genosValueScope2.normalized.startsWith('../') || __genosValueScope2.path.isAbsolute(__genosValueScope2.normalized)
      || __genosValueScope2.normalized.split('/').some((part) => ['.git', '.genos', 'node_modules', 'target', 'dist', 'coverage'].includes(part.toLowerCase()));
}

function collectWorkspaceContextPathsValue3(__genosValueScope3) {
  return !__genosValueScope3.relative || __genosValueScope3.relative.startsWith('..') || __genosValueScope3.path.isAbsolute(__genosValueScope3.relative);
}

module.exports = { collectWorkspaceContextPathsValue1, collectWorkspaceContextPathsValue2, collectWorkspaceContextPathsValue3 };
