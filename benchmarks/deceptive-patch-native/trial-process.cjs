'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {terminateChild} = require('../../backend/src/services/processTermination');
const io = require('../deceptive-patch-bench/io.cjs');
const protocol = require('./protocol.json');

function execute(directory, run) {
  const input = {directory: path.join(directory, 'trials', run.id),
    fixture: path.join(directory, 'fixtures', run.task), upstream: 'http://127.0.0.1:11434',
    seed: run.seed, arm: run.arm,
    prompt: fs.readFileSync(path.join(directory, 'fixtures', run.task, 'task.md'), 'utf8')};
  const filename = path.join(directory, 'inputs', run.id + '.json');
  io.write(filename, input);
  const started = new Date().toISOString();
  io.write(path.join(directory, 'started', run.id + '.json'), {...run, started});
  const stdout = fs.openSync(path.join(directory, 'outcomes', run.id + '.stdout.log'), 'wx');
  const stderr = fs.openSync(path.join(directory, 'outcomes', run.id + '.stderr.log'), 'wx');
  return runChild({directory, run, input, filename, started, stdout, stderr});
}
function runChild(context) {
  return new Promise(resolve => {
    const entry = context.run.arm === 'C' ? 'invoke.mjs' : 'react-run.mjs';
    const child = spawn(process.execPath, [path.join(__dirname, entry), context.filename], {
      cwd: path.resolve(__dirname, '../..'), windowsHide: true,
      env: {...process.env, TEMP: path.join(context.directory, 'tmp'), TMP: path.join(context.directory, 'tmp')},
      stdio: ['ignore', context.stdout, context.stderr]});
    fs.closeSync(context.stdout); fs.closeSync(context.stderr);
    let timedOut = false;
    context.timer = setTimeout(() => {timedOut = true; terminateChild(child);}, protocol.trialTimeoutMs + 120000);
    child.once('error', error => complete(context, {error: error.message, timedOut}, resolve));
    child.once('exit', (exitCode, signal) => complete(context, {exitCode, signal, timedOut}, resolve));
  });
}
function complete(context, outcome, finish) {
  if (context.settled) return;
  context.settled = true;
  clearTimeout(context.timer);
  const result = {...context.run, ...outcome, startedAt: context.started, finishedAt: new Date().toISOString()};
  io.write(path.join(context.directory, 'outcomes', context.run.id + '.json'), result);
  finish(result);
}
module.exports = {execute};
