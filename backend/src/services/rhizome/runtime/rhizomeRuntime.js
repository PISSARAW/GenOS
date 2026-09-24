'use strict';

const controller = require('./rhizomeController');
const rhizomeTick = require('./rhizomeTick');
const providerResolver = require('./providerResolver');
const verifierResolver = require('./verifierResolver');
const growthExecutor = require('./growthExecutor');

function create(input = {}) {
  const resolveProvider = providerResolver.create(input.providers, input.trustedProviderIds);
  const resolveVerifier = verifierResolver.create(input.verifiers, input.trustedVerifierDigests);
  const executeGrowth = growthExecutor.create({ resolveProvider, resolveVerifier, admissionPolicy: {
    trustedProviderIds: input.trustedProviderIds || [],
    trustedVerifierDigests: input.trustedVerifierDigests || []
  } });
  const services = { executeGrowth };
  return {
    tick: (context) => rhizomeTick.tick({ ...context, services }),
    run: (context) => controller.run({ ...context, services })
  };
}

module.exports = { create, run: controller.run, tick: rhizomeTick.tick };
