'use strict';
const {execFileSync} = require('node:child_process');
function git(root, args) {return execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();}
function assertVersion(input) {
  if (git(input.root, ['rev-parse', 'HEAD']) !== input.revision) throw Error('RUNTIME_REVISION_CHANGED');
  if (git(input.root, ['status', '--porcelain', '--untracked-files=normal'])) throw Error('RUNTIME_SOURCE_TREE_DIRTY');
}
module.exports = {assertVersion};
