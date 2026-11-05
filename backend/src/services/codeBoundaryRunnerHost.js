'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const safety = require('./pathSafety');
const values = require('./trinityProvenanceValues');

async function ownedFile(root, relative, content) {
  const filename = safety.resolveContainedPathNoSymlinkSync(root, relative, 'boundary runner');
  await fs.mkdir(path.dirname(filename), { recursive: true });
  try { await fs.writeFile(filename, content, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || values.hashBytes(await fs.readFile(filename)) !== values.hashBytes(content)) {
      throw Object.assign(values.failure('Q7_BOUNDARY_WORLD_INVALID'), { cause: error });
    }
  }
  safety.resolveContainedPathNoSymlinkSync(root, relative, 'boundary runner');
  return { path: relative, hash: values.hashBytes(content) };
}
async function install(input) {
  try { return await installFiles(input); }
  catch (cause) { throw Object.assign(values.failure('Q7_BOUNDARY_WORLD_INVALID'), { cause }); }
}
async function installFiles(input) {
  const runner = await fs.readFile(path.join(__dirname, 'codeBoundaryRunner.cjs'));
  const contract = Buffer.from(JSON.stringify(input.contract));
  const files = [await ownedFile(input.workspaceRoot, '.genos/boundary-check.cjs', runner),
    await ownedFile(input.workspaceRoot, '.genos/boundary-contract.json', contract)];
  return { hash: files[0].hash, contractHash: values.digest(input.contract), files };
}
function result(test) {
  const lines = String(test.stdout || '').split(/\r?\n/).filter(line => line.startsWith('GENOS_BOUNDARY_RESULT:'));
  try { return JSON.parse(lines.at(-1).slice('GENOS_BOUNDARY_RESULT:'.length)); } catch (_) { return null; }
}
module.exports = { install, result };
