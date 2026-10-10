'use strict';

const inbox = require('./localRuntimeObservationInbox');

async function generate(state, tools) {
  const startedAt = Date.now();
  const latencyLimit = Number(state.executionBudget?.latencyMs);
  for (let attempt = 0; attempt < 4; attempt++) {
    constrainLatency(state, startedAt, latencyLimit);
    inbox.apply(state, tools.emitEvent);
    await tools.checkpoint.save(state, 'inference');
    const canonical = tools.synthesis.canonicalGeneration(state.autonomyPlan);
    const generation = canonical || tools.createGeneration(state);
    const reply = await tools.awaitGeneration(state, generation.generation, generation.abort);
    tools.validateGeneration(reply, generation.fallback, state);
    if (inbox.currentRevision() === (state.observationRevision || 0)) {
      if (state.observationRevision && !String(reply).includes(inbox.latestEvidenceRef())) {
        state.framedPrompt += `\nRéessaie : la réponse doit citer exactement ${inbox.latestEvidenceRef()}.\n`;
        state.promptTokenEstimate = Math.ceil(Buffer.byteLength(state.framedPrompt, 'utf8') / 4);
        continue;
      }
      report(state, { emitEvent: tools.emitEvent, reply, canonical });
      return reply;
    }
  }
  throw new Error('Current observation was not cited within the local regeneration budget.');
}

function constrainLatency(state, startedAt, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return;
  const remaining = Math.floor(limit - (Date.now() - startedAt));
  if (remaining <= 0) throw new Error('Local observation regeneration exceeded latency budget.');
  state.executionBudget.latencyMs = remaining;
}

function report(state, output) {
  if (!state.observationRevision) return;
  const digest = inbox.latestDigest();
  const evidenceRef = inbox.latestEvidenceRef();
  output.emitEvent(state, { eventType: 'LOCAL_GENERATION_REBASED', action: 'GENERATE',
    detail: 'A generation completed from the revised observation prompt.', status: 'running',
    payload: { planRevision: state.observationRevision, modelGenerated: !output.canonical,
      latestDigest: digest, replyMentionsLatestDigest: String(output.reply).includes(digest),
      replyMentionsLatestPrefix: String(output.reply).includes(digest.slice(0, 8)),
      latestEvidenceRef: evidenceRef,
      replyMentionsLatestEvidenceRef: String(output.reply).includes(evidenceRef) } });
}

module.exports = { generate };
