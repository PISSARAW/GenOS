'use strict';

const communityStore = require('../communityStore');
const commitment = require('../deliberation/commitmentService');
const variantOrchestrator = require('./variantOrchestrator');
const membershipEvents = require('./persistentMembershipEvents');

async function collect({ context, loadActiveSession, invokeMember }) {
  const { session, participants, persistent } = await prepareParticipants({ context, loadActiveSession });
  const delphi = context.variantPolicy?.name === 'delphi_community'
    ? await variantOrchestrator.delphiContext({ ...context, session }) : null;
  const quarantined = await collectJudgments({ context, session, participants, delphi, invokeMember });
  const active = await loadActiveSession(context);
  const quorumReport = context.variantPolicy?.quarantineAware
    ? variantOrchestrator.assertByzantineQuorum({ ...context, session: active }) : null;
  const judgments = await commitment.revealJudgments({
    db: context.db, communityId: session.communityId, actorId: context.actorId
  });
  return { judgments, delphi: delphi ? {
    feedback: delphi.feedback,
    revisions: variantOrchestrator.delphiRevisions(delphi.previousByMember, judgments)
  } : undefined,
  byzantine: quorumReport ? { ...quorumReport, quarantined } : undefined,
  persistentCommunity: persistent?.report };
}

async function prepareParticipants({ context, loadActiveSession }) {
  const session = await loadActiveSession(context);
  const persistent = context.variantPolicy?.name === 'persistent_community'
    ? await variantOrchestrator.persistentContext({ ...context, session, judgments: [] }) : null;
  if (persistent) await membershipEvents.persistMembershipDecisions(context, session, persistent.report);
  const current = persistent ? await loadActiveSession(context) : session;
  const excluded = new Set(persistent?.report.excludedMemberIds || []);
  const participants = current.members.filter((member) => member.status === 'ACTIVE'
    && member.role !== 'community_facilitator' && !excluded.has(member.memberId));
  return { session, persistent, participants };
}

async function collectJudgments({ context, session, participants, delphi, invokeMember }) {
  const commitments = await communityStore.listCommitments(context.db, session.communityId, session.round);
  const committed = new Set(commitments.map((item) => item.memberId));
  const quarantined = [];
  for (const member of participants.filter((item) => !committed.has(item.memberId))) {
    const judgment = await invokeMember(context, {
      member, phase: 'SEALED_JUDGMENT',
      task: delphi ? 'Review anonymous prior-round feedback. Revise or maintain your judgment with reasons and evidence.'
        : 'Form an independent initial judgment.',
      details: delphi ? { anonymousFeedback: delphi.feedback,
        priorPosition: delphi.previousByMember.get(member.memberId) } : {}
    });
    if (context.variantPolicy?.quarantineAware) {
      const result = await variantOrchestrator.quarantineIfRequired({ ...context, session, member, judgment });
      if (result) { quarantined.push(result); continue; }
    }
    await commitment.commitJudgment({ db: context.db, communityId: context.communityId,
      memberId: member.memberId, judgment: judgment.judgment || judgment });
  }
  return quarantined;
}

module.exports = { collect };
