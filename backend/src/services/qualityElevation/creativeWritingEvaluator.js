'use strict';
const { textOf, defect, wordCount, inspectScreenplay, structuralResult } = require('./qualityText');
function evaluateCreativeWriting(content, options = {}) {
  const text = textOf(content);
  const screenplay = options.contract?.profile === 'screenplay' || /scénario|scenario|screenplay|court.métrage/i.test(options.mission || '');
  const inspected = screenplay ? inspectScreenplay(text, options.contract || options)
    : { defects: text.trim() ? [] : [defect('EMPTY_ARTIFACT', 'Texte absent.', { severity: 'blocker' })], metrics: { words: wordCount(text) } };
  // This scanner establishes structure only, never dramaturgy from keywords.
  return structuralResult('creative_writing', text, inspected);
}
module.exports = { evaluateCreativeWriting };
