'use strict';

const controller = require('./rhizomeController');
const rhizomeTick = require('./rhizomeTick');
const providerResolver = require('./providerResolver');
const verifierResolver = require('./verifierResolver');
const growthExecutor = require('./growthExecutor');
const providerAdapterRegistry = require('./providerAdapterRegistry');
const registeredProviders = require('./registeredProviderService');
const routeBindings = require('./routeExecutionBindings');
const lifecycle = require('./providerLifecycleService');

function create(input = {}) {
  const providers = [...(input.providers || []), ...providerAdapterRegistry.create(input.adapters), ...registeredProviders.create(input.registrations)];
  const resolveProvider = providerResolver.create(providers, input.trustedProviderIds);
  const resolveVerifier = verifierResolver.create(input.verifiers, input.trustedVerifierDigests);
  const executeGrowth = growthExecutor.create({ resolveProvider, resolveVerifier, admissionPolicy: {
    trustedProviderIds: input.trustedProviderIds || [],
    trustedVerifierDigests: input.trustedVerifierDigests || []
  } });
  const services = { executeGrowth };
  const bindings = routeBindings.create({ ...input, providers });
  const prepare = context => ({ ...context, services,
    trustedVerifierDigests: context.trustedVerifierDigests || input.trustedVerifierDigests,
    execute: context.execute || (route => bindings.execute({ ...route, sessionId: context.sessionId, options: context.options })),
    verify: context.verify || bindings.verify });
  return {
    tick: (context) => rhizomeTick.tick(prepare(context)),
    run: (context) => controller.run(prepare(context)),
    close: context => lifecycle.close({ ...context, providers })
  };
}

module.exports = { create, run: controller.run, tick: rhizomeTick.tick };
