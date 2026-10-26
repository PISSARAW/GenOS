'use strict';

const { execFileSync } = require('child_process');
const vfsSandbox = require('../services/vfsSandboxService');
const { generate } = require('../services/modelRouter');
const { applySearchReplace } = require('./swe_surgical_patcher');
const { selectVenvName } = require('./swe_native_verifier');

const PATCH_RESPONSE_FORMAT = {
  name: 'swe_bench_patch',
  schema: {
    type: 'object',
    properties: { diagnosis: { type: 'string' }, SEARCH: { type: 'string' }, REPLACE: { type: 'string' } },
    required: ['diagnosis', 'SEARCH', 'REPLACE'],
    additionalProperties: false
  }
};

async function synthesizePatch(params) {
  const { db, prompt, modelUri, originalSource, targetRelFile } = params;
  const result = await generate({ prompt, cognitiveRawPrompt: prompt, model: modelUri,
    priority: 'interactive', timeoutMs: 600000, maxTokens: 4096, responseFormat: PATCH_RESPONSE_FORMAT, db });
  const rawOutput = result.text || '';
  const response = result.structured || JSON.parse(rawOutput);
  console.log(`\n  [CHIDI DIAGNOSIS & REASONING]:\n${response.diagnosis}`);
  const patchText = JSON.stringify({ SEARCH: response.SEARCH, REPLACE: response.REPLACE });
  const applied = applySearchReplace(originalSource, patchText);
  if (applied.replacementsCount === 0) {
    console.warn(`  [SEARCH/REPLACE MISMATCH] Full output:\n${rawOutput}`);
    return { success: false, reason: 'search_replace_no_match', rawOutput, response };
  }
  const dryRun = vfsSandbox.simulateDryRun('genos_write',
    { path: targetRelFile, content: applied.modified }, { [targetRelFile]: originalSource });
  const blastScore = vfsSandbox.calculateBlastRadius(dryRun.sideEffects.filesModified.length, false, 'operator');
  return { success: true, modified: applied.modified, blastScore, rawOutput, response,
    replacementsCount: applied.replacementsCount };
}

function toWslPath(winPath) {
  return winPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
}

function checkSyntax(targetAbsFile, repoDir, task) {
  try {
    const wslFile = toWslPath(targetAbsFile);
    const repoName = require('path').basename(repoDir);
    const pyBin = `~/.swe_venvs/${selectVenvName(task, repoName)}/bin/python`;
    const quotedFile = `'${wslFile.replace(/'/g, "'\\''")}'`;
    const encoded = Buffer.from(`${pyBin} -m py_compile ${quotedFile}`, 'utf8').toString('base64');
    execFileSync('wsl', ['-d', 'Ubuntu-24.04', 'bash', '-c', `echo ${encoded} | base64 -d | bash`],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (error) {
    const detail = (error.stderr || error.stdout || error.message || '').toString();
    return { ok: false, error: detail };
  }
}

module.exports = { synthesizePatch, checkSyntax };
