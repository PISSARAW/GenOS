'use strict';

const { TopologyController } = require('./topologyController');

class ATeamController extends TopologyController {
  constructor(node, runtime) {
    super(node, runtime);
    this.subsystems = [];
    this.architecture = null;
    this.security = null;
    this.integration = null;
  }

  async compose(config = {}) {
    this.subsystems = config.subsystems || ['Architecture', 'Security', 'Integration'];
    this.architecture = config.architecture || { topology: 'trinity', variant: 'heterogeneous' };
    this.security = config.security || { topology: 'compete', children: [{ topology: 'trinity', variant: 'adversarial' }, { topology: 'rhizome' }] };
    this.integration = config.integration || { topology: 'sequence', children: [{ topology: 'syncytium' }, { topology: 'biocenose', variant: 'jury' }] };
    return { subsystems: this.subsystems };
  }

  async execute(input) {
    const { requirements = [], verified_claims = [], work_packages = [] } = input;

    const archResult = await this.runSubsystem('Architecture', { requirements, verified_claims });
    const secResult = await this.runSubsystem('Security', { work_packages });
    const intResult = await this.runSubsystem('Integration', { archResult, secResult });

    return {
      architecture: archResult,
      security: secResult,
      integration: intResult,
      verified_claims: [...verified_claims, ...(archResult.claims || []), ...(secResult.claims || [])]
    };
  }

  async runSubsystem(name, input) {
    const registry = this.runtime && this.runtime.controllerRegistry;
    if (registry && typeof registry.get === 'function') {
      const controller = registry.get(name.toLowerCase());
      if (controller) return controller.execute(input);
    }
    return { subsystem: name, processed: true, claims: [], input };
  }

  async observe() {
    const base = await super.observe();
    return {
      ...base,
      subsystems: this.subsystems,
      architecture: this.architecture,
      security: this.security,
      integration: this.integration
    };
  }

  async proposeAdaptation() {
    const adaptations = [];

    if (this.architecture && this.security) {
      const archClaims = this.architecture.claims || [];
      const secClaims = this.security.claims || [];

      if (archClaims.length === 0 && secClaims.length > 0) {
        adaptations.push({ type: 'NEST', host: 'Architecture', inner: 'Trinity', reason: 'Security found issues, need architecture review' });
      }
    }

    return adaptations.length ? adaptations : null;
  }
}

module.exports = { ATeamController };