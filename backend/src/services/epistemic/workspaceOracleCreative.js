'use strict';

const values = require('./workspaceOracleValues');
const BEATS = Object.freeze({ noire: 1, blanche: 2, ronde: 4 });

function music(subject, strategy, candidate) {
  const guide = values.source(subject, 'musicRules').toLowerCase();
  if (!validUnits(guide)) {
    throw new Error('music_units_outside_domain');
  }
  const bars = values.source(subject, 'music').trim().split(/\r?\n/).map(line => line.split(':').at(-1).trim().split(/\s+/));
  const durations = bars.map(notes => duration(notes, strategy));
  if (!values.fields(candidate, { durations })) return false;
  if (subject.contract.kind === 'publication_dossier') return true;
  const invalidBars = durations.map((beats, index) => beats !== 4 ? index + 1 : null).filter(Boolean);
  return values.fields(candidate, { invalidBars }) && Array.isArray(candidate.correctedMeasure3)
    && validCorrection(bars[2], candidate.correctedMeasure3, strategy);
}

function validCorrection(original, candidate, strategy) {
  return candidate.length > 0 && duration(candidate, strategy) === 4
    && require('./workspaceMusicCorrection').minimalCorrection(original, candidate, strategy);
}

function validUnits(guide) {
  return ['4 temps', 'noire=1', 'blanche=2', 'ronde=4'].every(unit => guide.includes(unit));
}

function duration(notes, strategy) {
  if (notes.some(note => !Object.hasOwn(BEATS, note))) throw new Error('musical_note_outside_domain');
  if (strategy === 'source_recompute') return notes.reduce((sum, note) => sum + BEATS[note], 0);
  return Object.entries(BEATS).reduce((sum, [note, beats]) => sum + notes.filter(n => n === note).length * beats, 0);
}

function poem(subject, strategy, candidate) {
  const stanzas = candidate.stanzas;
  if (!Array.isArray(stanzas) || stanzas.length !== 2) return false;
  if (!stanzas.every(stanza => Array.isArray(stanza) && stanza.length === 6)) return false;
  const lines = stanzas.flat();
  if (!lines.every(line => typeof line === 'string' && line.trim())) return false;
  if (strategy === 'source_recompute') return !lines.some(line => /\bnuit\b/i.test(line));
  const words = lines.join(' ').toLowerCase().split(/[^a-zà-ÿ]+/);
  return words.indexOf('nuit') === -1;
}

module.exports = { music, poem };
