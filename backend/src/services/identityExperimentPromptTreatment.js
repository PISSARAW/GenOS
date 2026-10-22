'use strict';
const crypto = require('crypto');
const ARMS = new Set(['genos_full', 'self_model_masked', 'llm_only', 'identity_sheet']);
function applyIdentityExperimentTreatment(input) {
  const arm = String(input.arm || '');
  if (!ARMS.has(arm)) throw new Error(`Unsupported identity experiment arm: ${arm}`);
  if (process.env.GENOS_IDENTITY_EXPERIMENT !== '1') {
    throw new Error('Identity experiment prompt treatments require GENOS_IDENTITY_EXPERIMENT=1');
  }
  const base = { selfIntro: input.selfIntro || '', conscienceBlock: input.conscienceBlock || '', workerSelfBlock: input.workerSelfBlock || '' };
  if (arm === 'genos_full') return { ...base, audit: { arm, includedSelfIntro: Boolean(base.selfIntro), includedConscience: Boolean(base.conscienceBlock), includedWorkerSelf: Boolean(base.workerSelfBlock) } };
  if (arm === 'self_model_masked') return { ...base, workerSelfBlock: '', audit: { arm, includedSelfIntro: Boolean(base.selfIntro), includedConscience: Boolean(base.conscienceBlock), includedWorkerSelf: false } };
  if (arm === 'llm_only') return { selfIntro: '', conscienceBlock: '', workerSelfBlock: '', audit: { arm, includedSelfIntro: false, includedConscience: false, includedWorkerSelf: false } };
  const sheet = `[IDENTITY SHEET]\n- Canonical agent ID: ${input.agentId}\n- Name: ${input.agentName}\n- Role: ${input.role}\n- No capability, history, or calibration data is supplied.`;
  return { selfIntro: '', conscienceBlock: '', workerSelfBlock: sheet,
    audit: { arm, includedSelfIntro: false, includedConscience: false, includedWorkerSelf: true, sheetOnly: true } };
}
function promptSha256(prompt) { return crypto.createHash('sha256').update(String(prompt)).digest('hex'); }
module.exports = { ARMS, applyIdentityExperimentTreatment, promptSha256 };
