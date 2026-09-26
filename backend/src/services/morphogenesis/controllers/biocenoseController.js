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
    this.jury = config.jury || [{ role: 'verifier' }, { role: 'critic' }, { role: 'architect' }];
    this.votingThreshold = config.votingThreshold || 0.66;
    return { jury: this.jury, threshold: this.votingThreshold };
  }

  async execute(input) {
    const { claims = [], evidence = [], artifacts = [], ballots = {} } = input;

    for (const juror of this.jury) {
      const vote = await this.jurorVote(juror, { claims, evidence, artifacts, ballots });
      this.votes[juror.role] = vote;
    }

    this.verdict = this.computeVerdict();
    return {
      verdict: this.verdict,
      votes: this.votes,
      approved: this.verdict === 'approved'
    };
  }

  async jurorVote(juror, context) {
    const ballot = context && context.ballots && context.ballots[juror.role];
    if (!ballot || (ballot.vote !== 'approve' && ballot.vote !== 'reject')) {
      throw new Error(`Biocenose juror ${juror.role} requires an explicit ballot (approve/reject)`);
    }
    return { role: juror.role, vote: ballot.vote, confidence: ballot.confidence ?? 0.5 };
  }

  computeVerdict() {
    const approves = Object.values(this.votes).filter(v => v.vote === 'approve').length;
    const total = Object.keys(this.votes).length;
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

module.exports = { BiocenoseController };