'use strict';

const MODES = new Set(['direct', 'indirect', 'free_indirect']);

function analyzeReportedSpeech(input = {}) {
  const reportedText = String(input.reportedText || input.text || '').trim();
  if (!reportedText) throw new Error('reportedText must be a non-empty string.');
  const mode = input.mode || 'direct';
  if (!MODES.has(mode)) throw new Error(`Unknown reported-speech mode '${mode}'.`);
  const sourceSpeaker = input.sourceSpeaker || null;
  const reportingSpeaker = input.reportingSpeaker || null;
  return {
    kind: 'ReportedSpeech',
    mode,
    sourceSpeaker,
    reportingSpeaker,
    reportedText,
    quotationBoundary: mode === 'direct',
    enunciation: {
      originalContext: input.originalContext || null,
      reportingContext: input.reportingContext || null,
      transformation: mode === 'direct' ? 'none' : 'recontextualization'
    },
    fidelity: input.fidelity || 'undetermined',
    status: 'structured'
  };
}

function analyzeDiscourse(input = {}) {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('text must be a non-empty string.');
  const segments = Array.isArray(input.segments) ? input.segments : [{ text, mode: 'direct' }];
  return {
    kind: 'Discourse',
    text,
    segments: segments.map((segment) => analyzeReportedSpeech({ ...segment, reportedText: segment.text || text })),
    intertextualReferences: input.intertextualReferences || [],
    status: 'structured'
  };
}

module.exports = { MODES, analyzeReportedSpeech, analyzeDiscourse };
