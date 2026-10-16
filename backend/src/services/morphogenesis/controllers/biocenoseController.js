'use strict';

const { TopologyController } = require('./topologyController');

class BiocenoseController extends TopologyController {
  constructor(node, runtime) {
    super(node, runtime);
    this.jury = [];
    this.verdict = null;
    this.votes = {};
  }

  async compose(config = {}) {
    this.variantPolicy = require('../../biocenose/variants/variantPolicyRouter')
      .select(config.variant || 'epistemic_jury');
    this.jury = config.jury || config.workers || [];
    this.votingThreshold = config.votingThreshold || 0.66;
    return { jury: this.jury, threshold: this.votingThreshold,
      variant: this.variantPolicy.name };
  }

  async execute(input) {
    if (input.db && input.communityId) {
      return require('../../biocenose/runtime/biocenoseRuntime').runRound({
        ...input, variant: this.variantPolicy.name
      });
    }
    const { claims = [], evidence = [], artifacts = [], ballots = {} } = input;

    for (const juror of this.jury) {
      const vote = await this.jurorVote(juror, { claims, evidence, artifacts, ballots });
      this.votes[jurorId(juror)] = vote;
    }

    this.verdict = this.computeVerdict();
    return {
      verdict: this.verdict,
      votes: this.votes,
      approved: this.verdict === 'approved', variant: this.variantPolicy.name,
      executionMode: 'simulated_controller'
    };
  }

  async jurorVote(juror, context) {
    const id = jurorId(juror);
    const ballot = context && context.ballots && context.ballots[id];
    if (!ballot || (ballot.vote !== 'approve' && ballot.vote !== 'reject')) {
      throw new Error(`Biocenose juror ${id} requires an explicit ballot (approve/reject)`);
    }
    return { jurorId: id, role: juror.role || null, vote: ballot.vote,
      confidence: ballot.confidence ?? null, evidenceRefs: ballot.evidenceRefs || [] };
  }

  computeVerdict() {
    const approves = Object.values(this.votes).filter(v => v.vote === 'approve').length;
    const total = Object.keys(this.votes).length;
    if (!total) return 'abstained';
    const evidenced = Object.values(this.votes).every((vote) => vote.evidenceRefs.length > 0);
    if (!evidenced) return 'abstained';
    return approves / total >= this.votingThreshold ? 'approved' : 'rejected';
  }

  async observe() {
    const base = await super.observe();
    return {
      ...base,
      jurySize: this.jury.length,
      votes: this.votes,
      verdict: this.verdict
    };
  }

  async proposeAdaptation() {
    if (this.verdict === 'rejected') {
      return [{ type: 'CHANGE_TOPOLOGY', to: 'rhizome', reason: 'Verdict rejected, need exploration' }];
    }
    if (this.verdict === 'approved' && this.votes.critic?.vote === 'reject') {
      return [{ type: 'NEST', host: 'Biocenose', inner: 'Trinity', reason: 'Critic dissent, need deeper verification' }];
    }
    return null;
  }
}

function jurorId(juror) {
  const id = juror.memberId || juror.workerId || juror.agentId || juror.id || juror.role;
  if (!id) throw new Error('Biocenose jurors require a stable identity.');
  return String(id);
}

module.exports = { BiocenoseController };
