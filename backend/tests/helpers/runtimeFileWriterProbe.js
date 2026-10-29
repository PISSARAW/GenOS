'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const SOLAR = `const {writeArtifact}=require(process.argv[1]);const p=require('node:path');
  const f=require('node:fs');(async()=>{const error=writeArtifact({allowFileEdits:true,
  pathLib:p,fsLib:f,workspaceRoot:process.argv[2]},'direct.txt','direct bytes');
  if(error)throw new Error(error);await require(process.argv[3]).flush();})().catch(e=>{
  console.error(e);process.exitCode=1;});`;

const LOCAL = `const writer=require(process.argv[1]);(async()=>{writer.writeArtifacts(
  JSON.stringify({artifactText:'[ARTIFACT: direct-local.txt]direct local bytes[/ARTIFACT]'}),
  {allowFileEdits:true,allowedWritePaths:['*'],workspaceRoot:process.argv[2]});
  await require(process.argv[3]).flush();})().catch(e=>{
  console.error(e);process.exitCode=1;});`;

async function writeAndReceive(workspace, kind) {
  const modulePath = kind === 'solar'
    ? path.resolve(__dirname, '../../bin/solarDirectFileActuator.cjs')
    : path.resolve(__dirname, '../../src/services/localArtifactWriter.js');
  const flushPath = path.resolve(__dirname, '../../src/services/runtimeFileWriteIpc.js');
  const child = spawn(process.execPath,
    ['-e', kind === 'solar' ? SOLAR : LOCAL, modulePath, workspace, flushPath],
    { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const closed = once(child, 'close');
  const [message] = await Promise.race([once(child, 'message'),
    closed.then(() => { throw new Error(`No ${kind} write receipt`); })]);
  const [code] = await closed;
  assert.equal(code, 0);
  return message;
}

module.exports = { writeAndReceive };
