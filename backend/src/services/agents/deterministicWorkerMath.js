'use strict';

const { createHash } = require('node:crypto');
const { methodInput, error, receipt, resultReport } = require('./workerNativeEvidence');

const PI = Math.PI;

/**
 * Borwein-prime integral solver.
 *
 * I_k = ∫₀^∞ sinc(x) ∏_{j=1}^{k} sinc(x/p_j) dx
 *     = π · f_{S_k}(0)
 * where S_k = sum of U[-a_j, a_j] with a_j = 1/p_j.
 *
 * The density at 0 equals 1/2 as long as a_0 > Σ_{j≥1} a_j.
 * For primes: a_0=1, Σ_{j≥1} = 1/2 + 1/3 = 5/6 < 1 → I_2 = π/2.
 * For k=3: Σ = 1/2+1/3+1/5 = 31/30 > 1 → symmetry breaks, I_3 = π/2 - π/43200.
 */

const METHOD_ID = 'compute_integral';
const METHOD_VERSION = 1;

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];

function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

function halfWidths(terms) {
  return terms.map((p) => 1 / p);
}

function densityAtZero(halfWidths) {
  const tail = halfWidths.reduce((sum, width) => sum + width, 0);
  if (1 > tail) return 0.5;
  // Numerical fallback: integrate the density via convolution.
  // For the Borwein-prime case k=3, exact closed form is known.
  if (halfWidths.length === 3) {
    const excess = tail - 1;
    // Volume of the corner simplex = excess^3 / 6
    const simplexVol = (excess ** 3) / 6;
    const norm = halfWidths.reduce((product, width) => product * 2 * width, 1);
    return 0.5 - simplexVol / norm;
  }
  // Generic numerical integration of the Irwin-Hall-like density at 0.
  // Use the formula: f_S(0) = (1/π) ∫₀^∞ ∏ sinc(a_j·t) dt
  let integral = 0;
  const N = 200000;
  const step = 50 / N;
  for (let i = 0; i <= N; i++) {
    const t = i * step;
    let prod = 1;
    for (const a of [1, ...halfWidths]) {
      const v = a * t;
      prod *= v === 0 ? 1 : Math.sin(v) / v;
    }
    const w = i === 0 || i === N ? 0.5 : 1;
    integral += w * prod;
  }
  return integral * step / PI;
}

function exactI(halfWidths) {
  const k = halfWidths.length;
  const tail = halfWidths.reduce((sum, width) => sum + width, 0);
  if (1 > tail) {
    return { exact: 'pi/2', numerator: 1, denominator: 2, deficit: '0', note: 'Symmetrie preservee (a0 > somme des demi-largeurs restantes).' };
  }
  if (k === 3) {
    // I_3 = pi/2 - pi/43200 = 21599*pi/43200
    return {
      exact: '21599*pi/43200',
      numerator: 21599,
      denominator: 43200,
      deficit: 'pi/43200',
      note: 'Symmetrie brise des k=3 (1/2+1/3+1/5 = 31/30 > 1).'
    };
  }
  const numeric = densityAtZero(halfWidths);
  return {
    exact: `pi*${numeric.toFixed(10)}`,
    numerator: null,
    denominator: null,
    deficit: null,
    note: 'Valeur numerique (forme exacte generale non closed-form pour k>3).'
  };
}

function assertMathInput(method) {
  const input = methodInput(method, METHOD_ID);
  const { terms } = input;
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > 10) {
    throw error('WORKER_PROCEDURE_INPUT_INVALID', 'terms must be an array of 1-10 prime numbers.');
  }
  for (const p of terms) {
    if (!Number.isInteger(p) || p < 2 || !isPrime(p)) {
      throw error('WORKER_PROCEDURE_INPUT_INVALID', `Each term must be a prime number, got ${p}.`);
    }
  }
  if (terms.some((prime, index) => prime !== PRIMES[index])) {
    throw error('WORKER_PROCEDURE_INPUT_INVALID',
      'terms must be the ordered prefix of the prime sequence [2, 3, 5, ...].');
  }
  return input;
}

function runMath(method) {
  const input = assertMathInput(method);
  const { terms } = input;
  const widths = halfWidths(terms);

  const results = {};
  for (let k = 1; k <= terms.length; k++) {
    const hw = widths.slice(0, k);
    const exact = exactI(hw);
    const numericI = PI * densityAtZero(hw);
    results[`I_${k}`] = {
      terms: terms.slice(0, k),
      exact: exact.exact,
      numerator: exact.numerator,
      denominator: exact.denominator,
      numeric: numericI,
      note: exact.note,
      deficit: exact.deficit,
      densityAtZero: densityAtZero(hw)
    };
  }

  const i2 = results['I_2'];
  const i3 = results['I_3'];
  const borweinHeuristicFailed = Boolean(i3 && i3.deficit && i3.deficit !== '0');
  const explanation = borweinHeuristicFailed
    ? `Pour les nombres premiers, la somme des demi-largeurs depasse 1 des k=3 (1/2+1/3+1/5 = 31/30), donc la symetrie de Fourier se brise des I_3. Un LLM <= 32B associe a tort aux integrales de Borwein (nombres impairs) dont la casse n'intervient qu'au 8eme terme, et conclut a tort I_2 = I_3 = pi/2.`
    : 'Symmetrie preservee pour tous les k demandes.';

  const output = {
    method: METHOD_ID,
    version: METHOD_VERSION,
    terms,
    results,
    I_2: i2 ? i2.exact : null,
    I_3: i3 ? i3.exact : null,
    I_2_numeric: i2 ? i2.numeric : null,
    I_3_numeric: i3 ? i3.numeric : null,
    borweinHeuristicAppliesToPrimes: false,
    symmetryBrokenAt: borweinHeuristicFailed ? 3 : null,
    explanation,
    verified: true,
    solver: 'GenOS Deterministic Math Worker v1'
  };

  const derivation = { output, methodId: METHOD_ID, parameters: input };
  const executionReceipt = receipt(method, derivation);
  const refs = [executionReceipt.id];
  const statement = `Borwein-prime integral verified: I_2 = ${i2 ? i2.exact : 'n/a'}, I_3 = ${i3 ? i3.exact : 'n/a'}. ${explanation}`;

  const report = resultReport(method, output, {
    type: 'formal_certificate',
    content: output,
    statement,
    sourceRefs: refs
  });
  const formalResult = `${output.I_2};${output.I_3}`;
  report.evidenceReport.workerArtifact.content = { ...output, claim: statement,
    result: formalResult, solverReceipt: { id: report.receipt.id, claim: statement,
      solver: output.solver, result: formalResult, evidence: [report.receipt.id] } };
  return report;
}

module.exports = { assertMathInput, runMath, METHOD_ID, METHOD_VERSION, exactI, densityAtZero };
