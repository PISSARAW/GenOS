'use strict';
const unmeasured = reason => ({ status: 'unmeasured', reason });
function candidate(report) { return report.workerArtifact?.content?.candidate || report.artifactText; }
function checksResult(checks) { return { status: checks.every(row => row.passed) ? 'passed' : 'failed', checks }; }
function poem(report) {
  const source = candidate(report);
  if (typeof source !== 'string' || !source.trim()) return unmeasured('No explicit poem candidate.');
  const stanzas = source.trim().split(/\r?\n\s*\r?\n/);
  const lines = stanzas.map(stanza => stanza.split(/\r?\n/).filter(line => line.trim()).length);
  return checksResult([{ label: 'two stanzas of six lines', passed: lines.length === 2 && lines.every(n => n === 6), actual: lines },
    { label: 'forbidden word absent', passed: !/\bnuit\b/iu.test(source) }]);
}
function fraction(value) {
  const [top, bottom = '1'] = value.split('/');
  const answer = Number(top) / Number(bottom);
  return Number.isFinite(answer) && answer > 0 ? answer : null;
}
function abcSource(source) {
  const fence = source.match(/```abc\s*([\s\S]*?)```/i);
  return fence ? fence[1] : source;
}
function parseHeaders(source) {
  const headers = {}; const body = [];
  for (const line of source.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    const header = line.match(/^([A-Za-z]):\s*(.*)$/);
    if (header) headers[header[1]] = header[2]; else body.push(line);
  }
  return { headers, body: body.join(' ') };
}
function lengthOf(token, unit) {
  const raw = token.replace(/^[A-Ga-gz][',]*/, '');
  if (!raw) return unit;
  if (/^\d+$/.test(raw)) return unit * Number(raw);
  const parts = raw.match(/^(\d*)\/(\d*)$/);
  if (!parts) return null;
  return unit * Number(parts[1] || 1) / Number(parts[2] || 2);
}
function parseBar(bar, unit) {
  const tokens = bar.match(/[A-Ga-gz][',]*(?:\d+\/?\d*|\/\d*)?/g) || [];
  if (!tokens.length || bar.replace(/[A-Ga-gz][',]*(?:\d+\/?\d*|\/\d*)?/g, '').trim()) return null;
  const lengths = tokens.map(token => lengthOf(token, unit));
  if (lengths.some(length => length === null || !Number.isFinite(length))) return null;
  return { duration: lengths.reduce((a, b) => a + b, 0), tokens: tokens.join(' ') };
}
function music(report) {
  const source = candidate(report);
  if (typeof source !== 'string' || !source.trim()) return unmeasured('No ABC candidate.');
  const { headers, body } = parseHeaders(abcSource(source));
  const checks = [{ label: 'numeric ABC tune index', passed: /^\d+$/.test(headers.X || '') },
    { label: '4/4 meter', passed: headers.M === '4/4' },
    { label: 'C major', passed: /^(C|Cmaj|C major)$/i.test(headers.K || '') },
    { label: 'quarter note tempo 96', passed: /^(1\/4\s*=\s*)?96$/.test(headers.Q || '') }];
  if (checks.some(row => !row.passed)) return checksResult(checks);
  if (/\^|_/.test(body)) return checksResult([...checks, { label: 'diatonic notes', passed: false }]);
  const unit = fraction(headers.L || '1/8');
  if (unit === null) return checksResult([...checks, { label: 'valid unit note length', passed: false }]);
  const bars = body.split('|').map(value => value.trim()).filter(Boolean);
  const parsed = bars.map(bar => parseBar(bar, unit));
  if (parsed.some(bar => bar === null)) return unmeasured('ABC uses notation outside the supported monophonic subset.');
  checks.push({ label: 'eight measures', passed: parsed.length === 8, actual: parsed.length });
  checks.push({ label: 'every measure fills 4/4', passed: parsed.every(bar => Math.abs(bar.duration - 1) < 1e-9), actual: parsed.map(bar => bar.duration) });
  checks.push({ label: 'final A repeats opening A', passed: parsed.length === 8 && parsed[0].tokens === parsed[6].tokens && parsed[1].tokens === parsed[7].tokens });
  return { ...checksResult(checks), limitations: ['A-prime/B musical interpretation and aesthetic quality are not assessed.'] };
}
module.exports = { poem, music };
