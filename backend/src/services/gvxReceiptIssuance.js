'use strict';

const path = require('node:path');
const records = require('./gvxExecutionEvidence');
const { hash, error } = require('./gvxContracts');

async function issue(options, create) {
  const binding=options.proofs.find(proof=>proof.verifierId==='gvx-longitudinal-assessment-v1').businessDecision.binding;
  const executionId=hash({scope:binding.scope,profileId:binding.profileId,applicationId:binding.applicationId});
  const profile=options.config.evaluator.profiles.find(item=>item.id===binding.profileId);
  await require('./gvxRuntimeStateVerification').verifyApplication(profile,binding.applicationId);
  const recordOptions = { ...options.config, root: path.join(options.config.evaluator.options.recordOptions.root, 'receipt-claims') };
  const prior = await records.readRecord(recordOptions, executionId);
  if (prior) return validatePrior(prior, options.claim);
  const signed = create();
  try {
    const saved = await records.writeRecord(recordOptions, { executionId, claimHash: hash(options.claim), signed });
    return saved.signed;
  } catch (failure) {
    if (failure.code !== 'GVX_EXECUTION_RECORD_CONFLICT') throw failure;
    return validatePrior(await records.readRecord(recordOptions, executionId), options.claim);
  }
}

function validatePrior(prior, claim) {
  if (prior.claimHash !== hash(claim)) throw error('GVX_MEASUREMENT_ALREADY_CLAIMED');
  return prior.signed;
}

module.exports = { issue };
