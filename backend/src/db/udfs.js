'use strict';

function brierScore(p, o) {
  const pred = JSON.parse(p || '[]');
  const out = JSON.parse(o || '[]');
  if (!pred.length || pred.length !== out.length) return null;
  return pred.reduce((s, v, i) => s + (v - out[i]) ** 2, 0) / pred.length;
}

function decay(v, age, hl) {
  if (!hl || hl <= 0) return 0;
  return v * Math.exp(-age / hl);
}

function entropy(j) {
  const vals = JSON.parse(j || '[]');
  if (!vals.length) return null;
  const total = vals.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  return -vals.filter(v => v > 0).reduce((s, v) => { const p = v / total; return s + p * Math.log2(p); }, 0);
}

function evidenceWeight(s, c) {
  const t = s + c;
  return t === 0 ? 0 : (s - c) / t;
}

function calibrationBin(pred, nb) {
  if (pred < 0 || pred > 1 || !nb || nb <= 0) return null;
  let b = Math.floor(pred * nb);
  return b >= nb ? nb - 1 : b;
}

function scopeKey(o, p) {
  return `${o || ''}:${p || ''}`;
}

const UDfs = [
  { name: 'genos_brier_score', arity: 2, fn: brierScore },
  { name: 'genos_decay', arity: 3, fn: decay },
  { name: 'genos_entropy', arity: 1, fn: entropy },
  { name: 'genos_evidence_weight', arity: 2, fn: evidenceWeight },
  { name: 'genos_calibration_bin', arity: 2, fn: calibrationBin },
  { name: 'genos_scope_key', arity: 2, fn: scopeKey },
];

function attachGenosUdfs(database) {
  for (const udf of UDfs) {
    database.function(udf.name, { arity: udf.arity, deterministic: true }, (a, b, c) => udf.fn(a, b, c));
  }
}

module.exports = { attachGenosUdfs };
